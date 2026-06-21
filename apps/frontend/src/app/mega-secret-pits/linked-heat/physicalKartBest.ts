import { ParsedRaceEvent, ParsedRaceTeam } from "../types";
import { LapItem } from "@/app/heats/types";
import { computeExcludedLapCounts, LapFilterContext } from "../lapFilters";

// Pure (store-free) physical-kart best computation, so both the linked-heat store
// and the kartBests hooks can use it without an import cycle.

/**
 * Canonical form of a kart number string. Handles "7" vs "07" mismatches
 * between user-entered kart numbers and timing-system lap.kart values.
 */
export function normalizeKart(k: string | null | undefined): string {
  if (!k) return "";
  const trimmed = k.trim();
  if (!trimmed) return "";
  const num = parseInt(trimmed, 10);
  return Number.isFinite(num) && String(num) === trimmed.replace(/^0+(?=\d)/, "")
    ? String(num)
    : trimmed;
}

// In EVERY timing system we ingest, `lap.kart` is the TEAM identifier (constant
// across the race), never the physical kart number — the physical kart driven in
// each stint is derived from the team's pit history (Phase 2 below).
export const LAP_KART_IS_TEAM_ID = true;

/**
 * Builds a map of `physicalKart -> bestLapMs` — the fastest lap recorded on each
 * physical kart by ANY team, attributing each lap to the kart driven during that
 * stint. See the long-form notes that previously lived in kartBests.ts.
 */
export function computeBestByPhysicalKart(
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  lapsByKart: Map<string, LapItem[]>,
  lapKartIsTeamId = false,
  ctx: LapFilterContext = {
    minLapMs: 0,
    excludeAfterLongMs: undefined,
    excludeFirstAfterPit: false,
    excludeAfterMissingLap: false,
  },
): Map<string, number> {
  const map = new Map<string, number>();

  const setBest = (kart: string, time: number) => {
    if (time <= 0) return;
    const k = normalizeKart(kart);
    if (!k) return;
    const prev = map.get(k);
    if (prev === undefined || time < prev) map.set(k, time);
  };

  // Phase 1: direct attribution by `lap.kart` (only for sms-timing, where lap.kart
  // is the physical kart). Skipped for team-id timing.
  if (!lapKartIsTeamId) {
    for (const [kart, laps] of lapsByKart) {
      const minOnlyCtx: LapFilterContext = {
        minLapMs: ctx.minLapMs,
        excludeAfterLongMs: undefined,
        excludeFirstAfterPit: false,
        excludeAfterMissingLap: false,
      };
      const excluded = computeExcludedLapCounts(laps, [], minOnlyCtx);
      for (const lap of laps) {
        if (excluded.has(lap.lapCount)) continue;
        setBest(kart, lap.time);
      }
    }
  }

  // Phase 2: segment mapping for team-id timing (racemann/getraceresults). Each
  // kart segment (split by pits AND breakdowns) attributes its laps to the physical
  // kart driven during it. Segments whose boundary lap is unknown are skipped.
  if (lapKartIsTeamId) {
    for (const team of Object.values(teams)) {
      const teamLaps = lapsByKart.get(team.startKart);
      if (!teamLaps || teamLaps.length === 0) continue;
      const teamPits = events.filter(
        (e) => e.type === "pit" && e.team?.startKart === team.startKart,
      );
      const excluded = computeExcludedLapCounts(teamLaps, teamPits, ctx);
      for (const seg of team.kartStints) {
        if (seg.startLap === null || seg.unbounded) continue;
        const start = seg.startLap;
        const end = seg.endLap ?? Infinity;
        for (const lap of teamLaps) {
          if (excluded.has(lap.lapCount)) continue;
          if (lap.lapCount >= start && lap.lapCount <= end) {
            setBest(seg.kart, lap.time);
          }
        }
      }
    }
  }

  return map;
}
