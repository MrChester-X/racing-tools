'use client';
import { useMemo } from 'react';
import { useRaceStore } from '../store/useRaceStore';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import type { LapItem } from '@/app/heats/types';
import type { ParsedRaceEvent } from '../types';

// The lap time of the lap during which a pit happened ("круг с питом"): the pit's
// linked lapNumber is the in-lap, and that lap's time from the linked heat is
// inflated by the pit-lane pass. Returns null if it can't be resolved.
function pitLapTime(
  lapsByKart: Map<string, LapItem[]>,
  startKart: string,
  lapNumber: number | undefined,
): number | null {
  if (typeof lapNumber !== 'number') return null;
  const laps = lapsByKart.get(startKart);
  const lap = laps?.find((l) => l.lapCount === lapNumber);
  return lap ? lap.time : null;
}

export interface PitLapDelta {
  // This pit's lap-with-pit time, in ms.
  lapTimeMs: number;
  // The fastest lap-with-pit across all pits in the race, in ms (the baseline).
  minLapTimeMs: number;
  // lapTimeMs - minLapTimeMs, in ms (>= 0). How much slower this pit lap was than
  // the quickest pit lap — i.e. "под красный".
  deltaMs: number;
}

// For a single pit event, compute how much slower its lap-with-pit was compared to
// the fastest lap-with-pit in the whole race. Returns null until both this pit's
// lap time and at least one baseline are known from the linked heat.
export function usePitLapDelta(event: ParsedRaceEvent): PitLapDelta | null {
  const events = useRaceStore((s) => s.events);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);

  const minLapTimeMs = useMemo(() => {
    let min = Infinity;
    for (const e of events ?? []) {
      if (e.type !== 'pit' || !e.team) continue;
      const t = pitLapTime(lapsByKart, e.team.startKart, e.lapNumber);
      if (t !== null && t < min) min = t;
    }
    return min === Infinity ? null : min;
  }, [events, lapsByKart]);

  const lapTimeMs =
    event.type === 'pit' && event.team
      ? pitLapTime(lapsByKart, event.team.startKart, event.lapNumber)
      : null;

  if (lapTimeMs === null || minLapTimeMs === null) return null;
  return { lapTimeMs, minLapTimeMs, deltaMs: Math.max(0, lapTimeMs - minLapTimeMs) };
}
