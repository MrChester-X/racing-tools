'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLinkedHeatStore } from './useLinkedHeatStore';
import { useRaceStore } from '../store/useRaceStore';
import { subscribeTick } from './useInProgressLap';
import type { ParsedRaceEvent } from '../types';

// First lap (inclusive) of the team's CURRENT stint: the out-lap right after its
// last pit, or lap 1 if it hasn't pitted. Returns null when the last pit has no
// linked lap number — then the stint can't be placed and the alarm stays off.
function currentStintStartLap(events: ParsedRaceEvent[] | null, startKart: string): number | null {
  if (!events) return 1;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'pit' && e.kart === startKart) {
      return typeof e.lapNumber === 'number' ? e.lapNumber + 1 : null;
    }
  }
  return 1;
}

// True when the team's current stint has reached the configured limit — by laps
// (laps in stint ≥ threshold) or by time (sum of this stint's lap times + the
// in-progress lap > threshold minutes). The time mode ticks live; the laps mode
// only recomputes when lap data changes, so it stays cheap.
export function useStintAlarm(startKart: string): boolean {
  const unit = useRaceStore((s) => s.raceData?.settings?.stintAlarmUnit);
  const threshold = useRaceStore((s) => s.raceData?.settings?.stintAlarmThreshold);
  const latest = useLinkedHeatStore((s) => s.latestByKart.get(startKart));
  const laps = useLinkedHeatStore((s) => s.lapsByKart.get(startKart));
  const events = useRaceStore((s) => s.events);

  const active = (unit === 'minutes' || unit === 'laps') && typeof threshold === 'number' && threshold > 0;
  const timeMode = active && unit === 'minutes';

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timeMode) return;
    return subscribeTick((t) => setNow(t));
  }, [timeMode]);

  const startLap = useMemo(
    () => (active && latest ? currentStintStartLap(events, startKart) : null),
    [active, latest, events, startKart],
  );

  // Sum of completed-lap times in the current stint (recomputed only on data change).
  const completedStintMs = useMemo(() => {
    if (!timeMode || startLap === null || !latest) return 0;
    let ms = 0;
    if (laps) {
      for (const l of laps) {
        if (l.lapCount >= startLap && l.lapCount <= latest.lapCount) ms += l.time;
      }
    }
    return ms;
  }, [timeMode, startLap, latest, laps]);

  if (!active || !latest || startLap === null) return false;

  if (unit === 'laps') {
    const lapsInStint = Math.max(0, latest.lapCount - (startLap - 1));
    return lapsInStint >= threshold!;
  }

  // minutes: completed stint laps + however long the in-progress lap has run.
  const passAtMs = latest.passAt ? Date.parse(latest.passAt) : NaN;
  const inProgressMs = Number.isFinite(passAtMs) ? Math.max(0, now - passAtMs) : 0;
  return completedStintMs + inProgressMs > threshold! * 60000;
}
