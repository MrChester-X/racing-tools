import { supabase } from '@/lib/supabase';
import { HeatItem, LapItem } from '@/app/heats/types';

export async function listKartodroms(): Promise<string[]> {
  const { data, error } = await supabase.from('heats').select('kartodromId');
  if (error) throw error;
  const unique = Array.from(
    new Set((data ?? []).map((r: { kartodromId: string }) => r.kartodromId)),
  ).sort();
  return unique;
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

export async function fetchAllLaps(heatId: string): Promise<LapItem[]> {
  const PAGE_SIZE = 1000;
  const all: LapItem[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('laps')
      .select('*')
      .eq('heatId', heatId)
      .order('lapCount', { ascending: true })
      .order('position', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as LapItem[];
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return all;
}
