import { useMemo } from "react";
import { useVideoConfig } from "remotion";
import { LapData, RaceLapEvent } from "../types";

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
};

const formatDelta = (delta: number): string => {
  const sign = delta <= 0 ? "" : "+";
  return `${sign}${delta.toFixed(2)}`;
};

/** Precomputed data for a single lap — everything that doesn't depend on the current frame. */
/** Duration in seconds for which the completed lap time stays frozen on screen. */
export const FREEZE_DURATION_SEC = 3;

export interface PrecomputedLap {
  count: number;
  time: number;
  absoluteStartTime: number;
  absoluteEndTime: number;
  startFrame: number;
  endFrame: number;
  isBest: boolean;
  delta: number | null; // null if this IS the best lap
  formattedTime: string;
  formattedDelta: string | null;
  /** Frame at which the freeze period starts (= endFrame, lap completion) */
  freezeStartFrame: number;
  /** Frame at which the freeze period ends (endFrame + 3s) */
  freezeEndFrame: number;
}

/** Precomputed history entry for display after a lap completes. */
export interface HistoryEntry {
  count: number;
  isBest: boolean;
  formattedLabel: string; // "L01", "L02", etc.
  formattedTime: string;
  /** Frame when this entry should appear (lap's end frame) */
  entryFrame: number;
  /** Formatted delta to absolute best, null if this IS the best */
  formattedDelta: string | null;
  /** Raw delta value for coloring */
  delta: number | null;
  /** Whether this lap hasn't been completed yet (shown at reduced opacity) */
  upcoming: boolean;
}

/** Beep config precomputed once. */
export interface BeepConfig {
  lapCount: number;
  startFrame: number;
  isBest: boolean;
}

export interface RaceData {
  absoluteBestTime: number;
  totalLaps: number;
  freezeDurationFrames: number;
  precomputedLaps: PrecomputedLap[];
  /** Sorted frame boundaries for binary search: [startFrame, lapIndex][] */
  frameBoundaries: [number, number][];
  /** Per-lap: history entries visible after that lap completes (up to 3, most recent first) */
  historyAtLap: Map<number, HistoryEntry[]>;
  beeps: BeepConfig[];
}

/**
 * Precomputes all race data once. Every per-frame calculation is reduced to
 * a binary search + direct property access.
 */
export function useRaceData(laps: LapData[], offsetSeconds: number): RaceData {
  const { fps } = useVideoConfig();

  return useMemo(() => {
    const absoluteBestTime = Math.min(...laps.map((l) => l.time));
    const freezeDurationFrames = Math.round(FREEZE_DURATION_SEC * fps);

    const precomputedLaps: PrecomputedLap[] = laps.map((lap) => {
      const startFrame = Math.round((lap.absoluteStartTime + offsetSeconds) * fps);
      const endFrame = Math.round((lap.absoluteEndTime + offsetSeconds) * fps);
      const isBest = Math.abs(lap.time - absoluteBestTime) < 0.001;
      const delta = isBest ? null : lap.time - absoluteBestTime;

      return {
        count: lap.count,
        time: lap.time,
        absoluteStartTime: lap.absoluteStartTime,
        absoluteEndTime: lap.absoluteEndTime,
        startFrame,
        endFrame,
        isBest,
        delta,
        formattedTime: formatTime(lap.time),
        formattedDelta: delta !== null ? formatDelta(delta) : null,
        freezeStartFrame: endFrame,
        freezeEndFrame: endFrame + freezeDurationFrames,
      };
    });

    // Frame boundaries for binary search: sorted by startFrame
    const frameBoundaries: [number, number][] = precomputedLaps.map((pl, i) => [
      pl.startFrame,
      i,
    ]);

    // Helper to build a history entry from a precomputed lap
    const makeEntry = (pl: PrecomputedLap, entryFrame: number, upcoming: boolean): HistoryEntry => ({
      count: pl.count,
      isBest: pl.isBest,
      formattedLabel: `L${(pl.count + 1).toString().padStart(2, "0")}`,
      formattedTime: pl.formattedTime,
      entryFrame,
      formattedDelta: pl.formattedDelta,
      delta: pl.delta,
      upcoming,
    });

    // Precompute history snapshots
    // Key -1: before any lap completes (during first lap) — show first lap as upcoming
    // Key i: after lap i completes — show completed 0..i + next lap as upcoming
    const historyAtLap = new Map<number, HistoryEntry[]>();

    // Before first lap completes: show L01 as upcoming
    if (precomputedLaps.length > 0) {
      const first = precomputedLaps[0];
      historyAtLap.set(-1, [makeEntry(first, first.startFrame, true)]);
    }

    for (let i = 0; i < precomputedLaps.length; i++) {
      const entries: HistoryEntry[] = [];

      // Upcoming lap (i+1) at the top
      if (i + 1 < precomputedLaps.length) {
        const next = precomputedLaps[i + 1];
        entries.push(makeEntry(next, precomputedLaps[i].endFrame, true));
      }

      // Completed laps (most recent first), fill up to 4 total
      const maxCompleted = 4 - entries.length;
      const completed = precomputedLaps.slice(0, i + 1);
      const recent = completed.slice(-maxCompleted).reverse();
      for (const pl of recent) {
        entries.push(makeEntry(pl, pl.endFrame, false));
      }

      historyAtLap.set(i, entries);
    }

    // Beep configs
    const beeps: BeepConfig[] = precomputedLaps.map((pl) => ({
      lapCount: pl.count,
      startFrame: pl.startFrame,
      isBest: pl.isBest,
    }));

    return {
      absoluteBestTime,
      totalLaps: laps.length,
      freezeDurationFrames,
      precomputedLaps,
      frameBoundaries,
      historyAtLap,
      beeps,
    };
  }, [laps, offsetSeconds, fps]);
}

/**
 * Binary search to find the active lap index for a given frame.
 * Returns -1 if no lap is active at this frame.
 */
export function findActiveLapIndex(
  precomputedLaps: PrecomputedLap[],
  frame: number
): number {
  // Binary search: find the last lap whose startFrame <= frame
  let lo = 0;
  let hi = precomputedLaps.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (precomputedLaps[mid].startFrame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Verify the frame is actually within this lap's range
  if (result >= 0 && frame < precomputedLaps[result].endFrame) {
    return result;
  }

  return -1;
}

/**
 * Count of completed laps at a given frame (for history lookup).
 * Returns the index of the last completed lap, or -1 if none completed.
 */
export function lastCompletedLapIndex(
  precomputedLaps: PrecomputedLap[],
  frame: number
): number {
  let lo = 0;
  let hi = precomputedLaps.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (precomputedLaps[mid].endFrame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

/** Precomputed snapshot of "best so far" across all drivers. */
export interface BestSoFarEntry {
  driverName: string;
  kart: string;
  formattedTime: string;
  /** Frame at which this becomes the new best */
  fromFrame: number;
}

/**
 * Precomputes "best so far" timeline from all drivers' lap events.
 * Returns a sorted array of BestSoFarEntry — each entry is active
 * from its `fromFrame` until the next entry's `fromFrame`.
 */
export function useBestSoFar(
  raceLapEvents: RaceLapEvent[] | undefined,
  offsetSeconds: number,
): BestSoFarEntry[] {
  const { fps } = useVideoConfig();

  return useMemo(() => {
    if (!raceLapEvents || raceLapEvents.length === 0) return [];

    // Sort by completion time
    const sorted = [...raceLapEvents].sort(
      (a, b) => a.absoluteEndTime - b.absoluteEndTime,
    );

    const timeline: BestSoFarEntry[] = [];
    let bestTime = Infinity;

    for (const event of sorted) {
      if (event.time < bestTime) {
        bestTime = event.time;
        timeline.push({
          driverName: event.driverName,
          kart: event.kart,
          formattedTime: formatTime(event.time),
          fromFrame: Math.round((event.absoluteEndTime + offsetSeconds) * fps),
        });
      }
    }

    return timeline;
  }, [raceLapEvents, offsetSeconds, fps]);
}

/**
 * Binary search to find the active "best so far" entry at a given frame.
 */
export function findBestSoFarAtFrame(
  timeline: BestSoFarEntry[],
  frame: number,
): BestSoFarEntry | null {
  if (timeline.length === 0) return null;

  let lo = 0;
  let hi = timeline.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (timeline[mid].fromFrame <= frame) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? timeline[result] : null;
}
