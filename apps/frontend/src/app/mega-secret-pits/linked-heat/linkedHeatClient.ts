import { supabase } from '@/lib/supabase';
import { mergeKartodromOptions } from '@/lib/kartodrom';
import { HeatItem, LapItem } from '@/app/heats/types';

export async function listKartodroms(): Promise<string[]> {
  const { data, error } = await supabase.from('heats').select('kartodromId');
  if (error) throw error;
  const fromDb = Array.from(
    new Set((data ?? []).map((r: { kartodromId: string }) => r.kartodromId)),
  );
  return mergeKartodromOptions(fromDb);
}

export async function listHeats(params: {
  kartodromId: string;
  page: number;
  limit: number;
}): Promise<{ data: HeatItem[]; total: number }> {
  const from = (params.page - 1) * params.limit;
  const to = from + params.limit - 1;
  const { data, count, error } = await supabase
    .from('heats')
    .select('*', { count: 'exact' })
    .eq('kartodromId', params.kartodromId)
    .order('createdAt', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data: (data ?? []) as HeatItem[], total: count ?? 0 };
}

export async function loadHeat(id: string): Promise<HeatItem | null> {
  const { data, error } = await supabase.from('heats').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as HeatItem | null) ?? null;
}

// Supabase/PostgREST caps a single request at 1000 rows, so a 50k-lap heat needs
// ~50 page requests. Doing them sequentially serializes ~50 round-trips; instead
// we read the total via a cheap `count` and fetch all pages through a bounded
// worker pool, cutting wall-clock to roughly ceil(pages / FETCH_CONCURRENCY)
// round-trips.
const PAGE_SIZE = 1000;
const FETCH_CONCURRENCY = 8;

// Fetch one page (offset window) of a heat's laps, ordered for deterministic
// pagination. Reused by the parallel bulk load and the staleness tail-check.
async function fetchLapsPage(heatId: string, from: number): Promise<LapItem[]> {
  const { data, error } = await supabase
    .from('laps')
    .select('*')
    .eq('heatId', heatId)
    .order('lapCount', { ascending: true })
    .order('position', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as LapItem[];
}

export async function fetchAllLaps(heatId: string): Promise<LapItem[]> {
  // 1) How many laps exist — one HEAD request, no rows transferred.
  const { count, error } = await supabase
    .from('laps')
    .select('*', { count: 'exact', head: true })
    .eq('heatId', heatId);
  if (error) throw error;
  const total = count ?? 0;
  if (total === 0) return [];
  const pages = Math.ceil(total / PAGE_SIZE);

  // 2) Fetch every page concurrently with a bounded pool. A shared cursor hands
  // out page indices so at most FETCH_CONCURRENCY requests are in flight; results
  // are stored by index to preserve lapCount/position order.
  const byPage: LapItem[][] = new Array(pages);
  let nextPage = 0;
  const worker = async () => {
    for (let p = nextPage++; p < pages; p = nextPage++) {
      byPage[p] = await fetchLapsPage(heatId, p * PAGE_SIZE);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, pages) }, worker),
  );
  const all = byPage.flat();

  // 3) `count` can lag rows inserted while a race is live. If the planned pages
  // came back completely full, there may be more — continue sequentially from the
  // end until a short page proves we've reached it. (Realtime/poll also backfill.)
  if (all.length === pages * PAGE_SIZE) {
    for (let from = pages * PAGE_SIZE; ; from += PAGE_SIZE) {
      const chunk = await fetchLapsPage(heatId, from);
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }
  }
  return all;
}

/**
 * Fetch only laps created after the given ISO timestamp. Used for polling
 * fallback so we don't re-download the full history each tick.
 */
export async function fetchLapsSince(
  heatId: string,
  sinceIso: string,
): Promise<LapItem[]> {
  // The poll delta since the last tick is small (usually < PAGE_SIZE), so this
  // stays a simple sequential loop; the heavy initial load is fetchAllLaps above.
  const all: LapItem[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('laps')
      .select('*')
      .eq('heatId', heatId)
      .gt('createdAt', sinceIso)
      .order('createdAt', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as LapItem[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return all;
}
