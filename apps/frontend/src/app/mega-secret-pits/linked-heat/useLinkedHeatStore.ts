'use client';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { HeatItem, LapItem } from '@/app/heats/types';
import { useRaceStore } from '../store/useRaceStore';
import { RaceData, RaceTeam } from '../types';
import { buildLapFilterContext, computeExcludedLapCounts } from '../lapFilters';
import { computeBestByPhysicalKart, LAP_KART_IS_TEAM_ID } from './physicalKartBest';
import * as api from './linkedHeatClient';

interface LinkedHeatState {
  heat: HeatItem | null;
  notFound: boolean;
  isLoading: boolean;
  loadingToken: number;
  channel: RealtimeChannel | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  latestByKart: Map<string, LapItem>;
  bestByKart: Map<string, number>;
  firstLapByKart: Map<string, LapItem>;
  lapsByKart: Map<string, LapItem[]>;
  // Best lap per PHYSICAL kart (across all teams/stints) + the global best, the
  // numbers behind every "+XX.XX" under a kart. Computed once per data change here
  // (not per component) so the deltas read primitives and don't re-render on every
  // incoming lap. See `_recomputeBest`.
  bestByPhysicalKart: Map<string, number>;
  globalBestPhysical: number | null;
  error: string | null;

  attachWatch: () => () => void;
  setLink: (id: string | null) => Promise<void>;
  importTeams: () => { added: number; skipped: number };
  /** Recompute derived maps (best/latest/first) from lapsByKart — call this when
   * settings affecting lap filtering (e.g. minLapTimeSec) change. */
  rebuildDerivedMaps: () => void;
  /** Recompute the physical-kart best map from current laps + teams/events/settings. */
  _recomputeBest: () => void;
  /** internal — used by watcher */
  _load: (id: string | null) => Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

function emptyMaps() {
  return {
    latestByKart: new Map<string, LapItem>(),
    bestByKart: new Map<string, number>(),
    firstLapByKart: new Map<string, LapItem>(),
    lapsByKart: new Map<string, LapItem[]>(),
    bestByPhysicalKart: new Map<string, number>(),
    globalBestPhysical: null as number | null,
  };
}

export const useLinkedHeatStore = create<LinkedHeatState>((set, get) => ({
  heat: null,
  notFound: false,
  isLoading: false,
  loadingToken: 0,
  channel: null,
  pollTimer: null,
  ...emptyMaps(),
  error: null,

  attachWatch: () => {
    const initial = useRaceStore.getState().raceData?.linkedHeatId ?? null;
    void get()._load(initial);

    const unsub = useRaceStore.subscribe((state, prev) => {
      const a = state.raceData?.linkedHeatId ?? null;
      const b = prev.raceData?.linkedHeatId ?? null;
      if (a !== b) {
        void get()._load(a);
        return;
      }
      // teams / events / settings feed the physical-kart best map (stint
      // attribution + lap filters) — recompute when any of them changes.
      if (
        state.teams !== prev.teams ||
        state.events !== prev.events ||
        state.raceData?.settings !== prev.raceData?.settings
      ) {
        get()._recomputeBest();
      }
    });

    return () => {
      unsub();
      const ch = get().channel;
      if (ch) void supabase.removeChannel(ch);
      const pt = get().pollTimer;
      if (pt) clearInterval(pt);
      set({
        heat: null,
        notFound: false,
        channel: null,
        pollTimer: null,
        error: null,
        ...emptyMaps(),
      });
    };
  },

  setLink: async (id) => {
    const data = useRaceStore.getState().raceData;
    if (!data) return;
    const updated: RaceData = { ...data, linkedHeatId: id };
    useRaceStore.getState().setRaceData(updated);
    useRaceStore.getState().saveRaceData();
  },

  _load: async (id) => {
    const token = get().loadingToken + 1;
    set({ loadingToken: token });

    const prevChannel = get().channel;
    if (prevChannel) await supabase.removeChannel(prevChannel);
    const prevPollTimer = get().pollTimer;
    if (prevPollTimer) clearInterval(prevPollTimer);

    if (!id) {
      set({
        heat: null,
        notFound: false,
        channel: null,
        pollTimer: null,
        isLoading: false,
        error: null,
        ...emptyMaps(),
      });
      return;
    }

    set({ isLoading: true, error: null, ...emptyMaps() });

    let heat: HeatItem | null = null;
    try {
      heat = await api.loadHeat(id);
    } catch (e) {
      if (get().loadingToken !== token) return;
      set({ isLoading: false, error: (e as Error).message });
      return;
    }
    if (get().loadingToken !== token) return;

    if (!heat) {
      set({ heat: null, notFound: true, isLoading: false, channel: null });
      return;
    }

    let laps: LapItem[];
    try {
      laps = await api.fetchAllLaps(id);
    } catch (e) {
      if (get().loadingToken !== token) return;
      set({ heat, notFound: false, isLoading: false, error: (e as Error).message });
      return;
    }
    if (get().loadingToken !== token) return;

    const latestByKart = new Map<string, LapItem>();
    const bestByKart = new Map<string, number>();
    const firstLapByKart = new Map<string, LapItem>();
    const lapsByKart = new Map<string, LapItem[]>();
    for (const lap of laps) applyLap(lap, latestByKart, bestByKart, firstLapByKart, lapsByKart);

    const channel = supabase
      .channel(`linked_heat:${id}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'laps', filter: `heatId=eq.${id}` },
        (payload) => {
          if (get().loadingToken !== token) return;
          const lap = payload.new as LapItem;
          if (!lap || typeof lap !== 'object' || !lap.kart) return;
          // Only clone the affected kart's list — other karts keep their array
          // refs so React/zustand selectors don't churn with N×M renders.
          const prevLaps = get().lapsByKart;
          const lapsByKart = new Map(prevLaps);
          const existingList = prevLaps.get(lap.kart) ?? [];
          lapsByKart.set(lap.kart, existingList.slice());
          const latestByKart = new Map(get().latestByKart);
          const bestByKart = new Map(get().bestByKart);
          const firstLapByKart = new Map(get().firstLapByKart);
          applyLap(lap, latestByKart, bestByKart, firstLapByKart, lapsByKart);
          set({ latestByKart, bestByKart, firstLapByKart, lapsByKart });
          get()._recomputeBest();
        },
      )
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (get().loadingToken !== token) return;
        // catch up on anything missed during subscribe handshake
        try {
          const fresh = await api.fetchAllLaps(id);
          if (get().loadingToken !== token) return;
          const l = new Map<string, LapItem>();
          const b = new Map<string, number>();
          const f = new Map<string, LapItem>();
          const all = new Map<string, LapItem[]>();
          for (const lap of fresh) applyLap(lap, l, b, f, all);
          set({ latestByKart: l, bestByKart: b, firstLapByKart: f, lapsByKart: all });
          get()._recomputeBest();
        } catch {
          // ignore — already have a (possibly slightly stale) snapshot
        }
      });

    // Periodic polling fallback — realtime can silently miss events on
    // half-open WebSockets (NAT timeouts, mobile network switches, etc.).
    // We use a `createdAt` cursor so each tick only downloads NEW laps
    // (overlap of 5s for clock skew). applyLap is idempotent, so any
    // duplicates from realtime are no-ops.
    let cursorIso = computeMaxCreatedAt(laps) ?? new Date(Date.now() - 60_000).toISOString();
    const pollTimer = setInterval(async () => {
      if (get().loadingToken !== token) return;
      const sinceIso = shiftIsoBack(cursorIso, 5_000);
      let fresh: LapItem[];
      try {
        fresh = await api.fetchLapsSince(id, sinceIso);
      } catch {
        return; // transient error — wait for next tick
      }
      if (get().loadingToken !== token || fresh.length === 0) return;

      let added = 0;
      const newLatest = new Map(get().latestByKart);
      const newBest = new Map(get().bestByKart);
      const newFirst = new Map(get().firstLapByKart);
      const newLaps = new Map<string, LapItem[]>();
      // shallow-copy only kart lists that actually receive new laps
      const touchedKarts = new Set<string>();
      for (const lap of fresh) {
        const list = get().lapsByKart.get(lap.kart);
        const had = list?.some((l) => l.lapCount === lap.lapCount) ?? false;
        if (!had) {
          touchedKarts.add(lap.kart);
          if (!newLaps.has(lap.kart)) newLaps.set(lap.kart, (list ?? []).slice());
          applyLap(lap, newLatest, newBest, newFirst, newLaps);
          added++;
        }
        const lapCreatedAt = lap.createdAt ?? '';
        if (lapCreatedAt > cursorIso) cursorIso = lapCreatedAt;
      }
      if (added === 0) return;

      const finalLapsByKart = new Map(get().lapsByKart);
      for (const k of touchedKarts) finalLapsByKart.set(k, newLaps.get(k)!);
      set({
        latestByKart: newLatest,
        bestByKart: newBest,
        firstLapByKart: newFirst,
        lapsByKart: finalLapsByKart,
      });
      get()._recomputeBest();
    }, POLL_INTERVAL_MS);

    set({
      heat,
      notFound: false,
      latestByKart,
      bestByKart,
      firstLapByKart,
      lapsByKart,
      channel,
      pollTimer,
      isLoading: false,
      error: null,
    });
    get()._recomputeBest();
  },

  rebuildDerivedMaps: () => {
    const { lapsByKart } = get();
    const latestByKart = new Map<string, LapItem>();
    const bestByKart = new Map<string, number>();
    const firstLapByKart = new Map<string, LapItem>();
    for (const laps of lapsByKart.values()) {
      for (const lap of laps) applyLap(lap, latestByKart, bestByKart, firstLapByKart, lapsByKart);
    }
    set({ latestByKart, bestByKart, firstLapByKart });
    get()._recomputeBest();
  },

  _recomputeBest: () => {
    const { lapsByKart } = get();
    const rs = useRaceStore.getState();
    const teams = rs.teams;
    const events = rs.events;
    if (!teams || !events || lapsByKart.size === 0) {
      if (get().bestByPhysicalKart.size > 0 || get().globalBestPhysical !== null) {
        set({ bestByPhysicalKart: new Map(), globalBestPhysical: null });
      }
      return;
    }
    const ctx = buildLapFilterContext(rs.raceData?.settings);
    const map = computeBestByPhysicalKart(teams, events, lapsByKart, LAP_KART_IS_TEAM_ID, ctx);
    let globalBestPhysical: number | null = null;
    for (const v of map.values()) if (globalBestPhysical === null || v < globalBestPhysical) globalBestPhysical = v;
    set({ bestByPhysicalKart: map, globalBestPhysical });
  },

  importTeams: () => {
    const raceData = useRaceStore.getState().raceData;
    if (!raceData) return { added: 0, skipped: 0 };
    const firstLaps = Array.from(get().firstLapByKart.values());
    const existing = new Set(raceData.teams.map((t) => t.startKart));
    const toAdd: RaceTeam[] = firstLaps
      .filter((lap) => !existing.has(lap.kart))
      .map((lap) => ({ name: lap.driverName, startKart: lap.kart }));
    if (toAdd.length === 0) {
      return { added: 0, skipped: firstLaps.length };
    }
    const updated: RaceData = { ...raceData, teams: [...raceData.teams, ...toAdd] };
    useRaceStore.getState().setRaceData(updated);
    useRaceStore.getState().saveRaceData();
    return { added: toAdd.length, skipped: firstLaps.length - toAdd.length };
  },
}));

function computeMaxCreatedAt(laps: LapItem[]): string | null {
  let max: string | null = null;
  for (const l of laps) {
    if (l.createdAt && (max === null || l.createdAt > max)) max = l.createdAt;
  }
  return max;
}

function shiftIsoBack(iso: string, ms: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t - ms).toISOString();
}

// Module-scoped memo for `min(bestByKart.values())` — every TeamRow's
// LinkedHeatOverlay reads it; without caching the spread+Math.min is
// re-evaluated on every store update for every consumer.
let absoluteBestCache: { src: Map<string, number> | null; result: number | undefined } = {
  src: null,
  result: undefined,
};

export function selectAbsoluteBest(bestByKart: Map<string, number>): number | undefined {
  if (absoluteBestCache.src === bestByKart) return absoluteBestCache.result;
  let min = Infinity;
  for (const v of bestByKart.values()) if (v < min) min = v;
  const result = min === Infinity ? undefined : min;
  absoluteBestCache = { src: bestByKart, result };
  return result;
}

function applyLap(
  lap: LapItem,
  latestByKart: Map<string, LapItem>,
  bestByKart: Map<string, number>,
  firstLapByKart: Map<string, LapItem>,
  lapsByKart: Map<string, LapItem[]>,
) {
  const prev = latestByKart.get(lap.kart);
  if (!prev || lap.lapCount > prev.lapCount) latestByKart.set(lap.kart, lap);
  const prevFirst = firstLapByKart.get(lap.kart);
  if (!prevFirst || lap.lapCount < prevFirst.lapCount) firstLapByKart.set(lap.kart, lap);

  const list = lapsByKart.get(lap.kart) ?? [];
  const idx = list.findIndex((l) => l.lapCount === lap.lapCount);
  if (idx >= 0) {
    list[idx] = lap;
  } else {
    list.push(lap);
  }
  lapsByKart.set(lap.kart, list);

  // Recompute best for this kart from the full filtered list. Min-time,
  // exclude-after-long and exclude-first-after-pit all need cross-lap info,
  // so per-lap incremental update isn't enough.
  const settings = useRaceStore.getState().raceData?.settings;
  const ctx = buildLapFilterContext(settings);
  const events = useRaceStore.getState().events ?? [];
  const teamPits = events.filter((e) => e.type === 'pit' && e.team?.startKart === lap.kart);
  const excluded = computeExcludedLapCounts(list, teamPits, ctx);
  let best = Infinity;
  for (const l of list) {
    if (excluded.has(l.lapCount)) continue;
    if (l.time < best) best = l.time;
  }
  if (best === Infinity) bestByKart.delete(lap.kart);
  else bestByKart.set(lap.kart, best);
}
