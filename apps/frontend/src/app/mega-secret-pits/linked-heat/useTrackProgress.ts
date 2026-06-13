'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import { useRaceStore } from '../store/useRaceStore';
import { subscribeTick, computeAvgRecentMs } from './useInProgressLap';

export interface TeamProgress {
  // Lap fraction 0..1 (elapsed since last crossing / recent average lap).
  progress: number;
  // false → not enough data, parked at the start-finish line (progress 0).
  hasData: boolean;
}

// Batch version of useInProgressLap's position math: lap progress for many teams
// at once, sharing a single 100ms tick. Computing all positions in one place lets
// the track map detect karts running nose-to-tail and fan them apart.
export function useTrackProgress(startKarts: string[]): Map<string, TeamProgress> {
  const latestByKart = useLinkedHeatStore((s) => s.latestByKart);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);
  const settings = useRaceStore((s) => s.raceData?.settings);
  const events = useRaceStore((s) => s.events);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeTick((t) => setNow(t)), []);

  const key = startKarts.join(',');

  return useMemo(() => {
    const map = new Map<string, TeamProgress>();
    for (const startKart of startKarts) {
      const latest = latestByKart.get(startKart);
      const passAtMs = latest?.passAt ? Date.parse(latest.passAt) : NaN;
      const avg = computeAvgRecentMs(lapsByKart.get(startKart), settings, events, startKart);
      if (Number.isFinite(passAtMs) && avg && avg > 0) {
        map.set(startKart, { progress: Math.min(1, Math.max(0, (now - passAtMs) / avg)), hasData: true });
      } else {
        map.set(startKart, { progress: 0, hasData: false });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, latestByKart, lapsByKart, settings, events, now]);
}
