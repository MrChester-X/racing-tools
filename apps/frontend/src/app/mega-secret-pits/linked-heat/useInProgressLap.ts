'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import { useRaceStore } from '../store/useRaceStore';

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

function subscribeTick(cb: (now: number) => void): () => void {
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

export function useInProgressLap(startKart: string): InProgressLap | null {
  const latest = useLinkedHeatStore((s) => s.latestByKart.get(startKart));
  const laps = useLinkedHeatStore((s) => s.lapsByKart.get(startKart));
  const maxLapSec = useRaceStore((s) => s.raceData?.settings?.maxLapTimeForAverageSec);
  const [now, setNow] = useState(() => Date.now());

  const passAtStr = latest?.passAt ?? null;
  const passAtMs = passAtStr ? Date.parse(passAtStr) : NaN;
  const hasBase = Number.isFinite(passAtMs);

  useEffect(() => {
    if (!hasBase) return;
    return subscribeTick((t) => setNow(t));
  }, [hasBase]);

  const avgRecentMs = useMemo(() => {
    if (!laps || laps.length === 0) return null;
    const maxMs = typeof maxLapSec === 'number' && maxLapSec > 0 ? maxLapSec * 1000 : Infinity;
    const top = [...laps]
      .sort((a, b) => b.lapCount - a.lapCount)
      .filter((l) => l.time <= maxMs)
      .slice(0, AVG_WINDOW);
    if (top.length === 0) return null;
    const sum = top.reduce((s, l) => s + l.time, 0);
    return sum / top.length;
  }, [laps, maxLapSec]);

  if (!latest || !hasBase) return null;

  return {
    nextLapNumber: latest.lapCount + 1,
    elapsedMs: now - passAtMs,
    avgRecentMs,
  };
}
