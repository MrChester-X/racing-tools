import { LapItem } from "@/app/heats/types";
import { ParsedRaceEvent, RaceSettings } from "./types";

export interface LapFilterContext {
  /** Below this time (ms) the lap is fully excluded. 0 = no min filter. */
  minLapMs: number;
  /**
   * If set, any lap whose IMMEDIATE PREDECESSOR (lapCount-1, same kart) exceeded
   * this time (ms) is fully excluded. Used to skip out-laps after very long laps.
   */
  excludeAfterLongMs?: number;
  /**
   * If true, the first lap AFTER each pit event for this team
   * (pit.lapNumber + 1) is fully excluded.
   */
  excludeFirstAfterPit: boolean;
  /**
   * If true, any lap whose predecessor (lapCount - 1) is missing from the
   * data is fully excluded — e.g. data joined mid-race, or a lap was lost.
   * This also excludes the very first lap of each kart.
   */
  excludeAfterMissingLap: boolean;
}

/** Build a LapFilterContext from RaceSettings (single source of truth). */
export function buildLapFilterContext(
  settings: RaceSettings | undefined,
): LapFilterContext {
  const minSec = settings?.minLapTimeSec;
  const maxSec = settings?.maxLapTimeForAverageSec;
  return {
    minLapMs: typeof minSec === "number" && minSec > 0 ? minSec * 1000 : 0,
    excludeAfterLongMs:
      settings?.excludeLapAfterLong && typeof maxSec === "number" && maxSec > 0
        ? maxSec * 1000
        : undefined,
    excludeFirstAfterPit: !!settings?.excludeFirstLapAfterPit,
    excludeAfterMissingLap: !!settings?.excludeAfterMissingLap,
  };
}

/**
 * Returns set of lapCount values that must be FULLY excluded from any stat
 * (best, avg, count). Does NOT include the maxLapTimeForAverageSec filter,
 * which only affects avg and is applied separately at the avg sum step.
 */
export function computeExcludedLapCounts(
  laps: LapItem[],
  teamPits: ParsedRaceEvent[],
  ctx: LapFilterContext,
): Set<number> {
  const excluded = new Set<number>();

  // min filter — full exclusion
  if (ctx.minLapMs > 0) {
    for (const l of laps) if (l.time < ctx.minLapMs) excluded.add(l.lapCount);
  }

  // exclude lap after long lap (per kart, by sequential lapCount)
  if (ctx.excludeAfterLongMs !== undefined) {
    const sorted = [...laps].sort((a, b) => a.lapCount - b.lapCount);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].time > ctx.excludeAfterLongMs) {
        excluded.add(sorted[i + 1].lapCount);
      }
    }
  }

  // exclude first lap after each pit
  if (ctx.excludeFirstAfterPit) {
    for (const pit of teamPits) {
      if (typeof pit.lapNumber === "number") {
        excluded.add(pit.lapNumber + 1);
      }
    }
  }

  // exclude lap if predecessor (lapCount - 1) is missing from data
  if (ctx.excludeAfterMissingLap) {
    const present = new Set(laps.map((l) => l.lapCount));
    for (const l of laps) {
      if (!present.has(l.lapCount - 1)) excluded.add(l.lapCount);
    }
  }

  return excluded;
}

/** Convenience: filter laps array, dropping all fully-excluded laps. */
export function filterLaps(
  laps: LapItem[],
  teamPits: ParsedRaceEvent[],
  ctx: LapFilterContext,
): LapItem[] {
  const excluded = computeExcludedLapCounts(laps, teamPits, ctx);
  if (excluded.size === 0) return laps;
  return laps.filter((l) => !excluded.has(l.lapCount));
}
