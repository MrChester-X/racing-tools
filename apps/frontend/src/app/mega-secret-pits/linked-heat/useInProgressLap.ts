'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import { useRaceStore } from '../store/useRaceStore';
import { buildLapFilterContext, computeExcludedLapCounts } from '../lapFilters';
import type { LapItem } from '@/app/heats/types';
import type { ParsedRaceEvent, RaceSettings } from '../types';

// Shared 100ms tick — every Kart's <InProgressLap*> would otherwise spawn
// its own setInterval. With 30+ karts that's 300+ setStates/sec.
const tickListeners = new Set<(now: number) => void>();
let tickInterval: number | null = null;

function ensureTick() {
  if (tickInterval !== null || typeof window === 'undefined') return;
  tickInterval = window.setInterval(() => {
    const now = Date.now();
    for (const cb of tickListeners) cb(now);
  }, 100);
}

export function subscribeTick(cb: (now: number) => void): () => void {
  tickListeners.add(cb);
  ensureTick();
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickInterval !== null) {
      window.clearInterval(tickInterval);
      tickInterval = null;
    }
  };
}

export interface InProgressLap {
  nextLapNumber: number;
  elapsedMs: number;
  avgRecentMs: number | null;
}

export function formatInProgressElapsed(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  const secStr = sec.toFixed(1).padStart(4, '0');
  return `${min.toString().padStart(2, '0')}:${secStr}`;
}

const AVG_WINDOW = 3;

// Average of the AVG_WINDOW most recent laps for a team, excluding pit-affected
// laps and laps over the settings' max-lap-time threshold. This is the baseline a
// lap's progress (and the track marker position) is measured against. Returns null
// when there aren't enough clean laps yet.
export function computeAvgRecentMs(
  laps: LapItem[] | undefined,
  settings: RaceSettings | undefined,
  events: ParsedRaceEvent[] | null,
  startKart: string,
): number | null {
  if (!laps || laps.length === 0) return null;
  const maxLapSec = settings?.maxLapTimeForAverageSec;
  const maxMs = typeof maxLapSec === 'number' && maxLapSec > 0 ? maxLapSec * 1000 : Infinity;
  const ctx = buildLapFilterContext(settings);
  const teamPits = (events ?? []).filter(
    (e) => e.type === 'pit' && e.team?.startKart === startKart,
  );
  const excluded = computeExcludedLapCounts(laps, teamPits, ctx);
  const top = [...laps]
    .sort((a, b) => b.lapCount - a.lapCount)
    .filter((l) => !excluded.has(l.lapCount) && l.time <= maxMs)
    .slice(0, AVG_WINDOW);
  if (top.length === 0) return null;
  const sum = top.reduce((s, l) => s + l.time, 0);
  return sum / top.length;
}

export function useInProgressLap(startKart: string): InProgressLap | null {
  const latest = useLinkedHeatStore((s) => s.latestByKart.get(startKart));
  const laps = useLinkedHeatStore((s) => s.lapsByKart.get(startKart));
  const settings = useRaceStore((s) => s.raceData?.settings);
  const events = useRaceStore((s) => s.events);
  const [now, setNow] = useState(() => Date.now());

  const passAtStr = latest?.passAt ?? null;
  const passAtMs = passAtStr ? Date.parse(passAtStr) : NaN;
  const hasBase = Number.isFinite(passAtMs);

  useEffect(() => {
    if (!hasBase) return;
    return subscribeTick((t) => setNow(t));
  }, [hasBase]);

  const avgRecentMs = useMemo(
    () => computeAvgRecentMs(laps, settings, events, startKart),
    [laps, settings, events, startKart],
  );

  if (!latest || !hasBase) return null;

  return {
    nextLapNumber: latest.lapCount + 1,
    elapsedMs: now - passAtMs,
    avgRecentMs,
  };
}
