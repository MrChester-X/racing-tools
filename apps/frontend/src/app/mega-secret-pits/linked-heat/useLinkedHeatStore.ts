'use client';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { HeatItem, LapItem } from '@/app/heats/types';
import { useRaceStore } from '../store/useRaceStore';
import { RaceData, RaceTeam } from '../types';
import * as api from './linkedHeatClient';

interface LinkedHeatState {
  heat: HeatItem | null;
  notFound: boolean;
  isLoading: boolean;
  loadingToken: number;
  channel: RealtimeChannel | null;
  latestByKart: Map<string, LapItem>;
  bestByKart: Map<string, number>;
  firstLapByKart: Map<string, LapItem>;
  lapsByKart: Map<string, LapItem[]>;
  error: string | null;

  attachWatch: () => () => void;
  setLink: (id: string | null) => Promise<void>;
  importTeams: () => { added: number; skipped: number };
  /** internal — used by watcher */
  _load: (id: string | null) => Promise<void>;
}

function emptyMaps() {
  return {
    latestByKart: new Map<string, LapItem>(),
    bestByKart: new Map<string, number>(),
    firstLapByKart: new Map<string, LapItem>(),
    lapsByKart: new Map<string, LapItem[]>(),
  };
}

export const useLinkedHeatStore = create<LinkedHeatState>((set, get) => ({
  heat: null,
  notFound: false,
  isLoading: false,
  loadingToken: 0,
  channel: null,
  ...emptyMaps(),
  error: null,

  attachWatch: () => {
    const initial = useRaceStore.getState().raceData?.linkedHeatId ?? null;
    void get()._load(initial);

    const unsub = useRaceStore.subscribe((state, prev) => {
      const a = state.raceData?.linkedHeatId ?? null;
      const b = prev.raceData?.linkedHeatId ?? null;
      if (a !== b) void get()._load(a);
    });

    return () => {
      unsub();
      const ch = get().channel;
      if (ch) void supabase.removeChannel(ch);
      set({
        heat: null,
        notFound: false,
        channel: null,
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

    if (!id) {
      set({
        heat: null,
        notFound: false,
        channel: null,
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
          const next = {
            latestByKart: new Map(get().latestByKart),
            bestByKart: new Map(get().bestByKart),
            firstLapByKart: new Map(get().firstLapByKart),
            lapsByKart: new Map(
              Array.from(get().lapsByKart.entries()).map(([k, v]) => [k, v.slice()]),
            ),
          };
          applyLap(lap, next.latestByKart, next.bestByKart, next.firstLapByKart, next.lapsByKart);
          set(next);
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
        } catch {
          // ignore — already have a (possibly slightly stale) snapshot
        }
      });

    set({
      heat,
      notFound: false,
      latestByKart,
      bestByKart,
      firstLapByKart,
      lapsByKart,
      channel,
      isLoading: false,
      error: null,
    });
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

function applyLap(
  lap: LapItem,
  latestByKart: Map<string, LapItem>,
  bestByKart: Map<string, number>,
  firstLapByKart: Map<string, LapItem>,
  lapsByKart: Map<string, LapItem[]>,
) {
  const prev = latestByKart.get(lap.kart);
  if (!prev || lap.lapCount > prev.lapCount) latestByKart.set(lap.kart, lap);
  const prevBest = bestByKart.get(lap.kart);
  if (prevBest === undefined || lap.time < prevBest) bestByKart.set(lap.kart, lap.time);
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
}
