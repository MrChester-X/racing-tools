import { useMemo } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "./useLinkedHeatStore";
import { ParsedRaceEvent, ParsedRaceTeam, RaceSettings } from "../types";
import { LapItem } from "@/app/heats/types";
import { buildLapFilterContext, computeExcludedLapCounts, LapFilterContext } from "../lapFilters";

export type StintStats =
  | { kind: "ok"; count: number; avg: number | null; avgCount: number; best: number }
  | { kind: "missing-lap-numbers" }
  | { kind: "no-data" };

/** Lap count / average / best for a single team stint, from the linked heat. */
export function computeStintStats(
  startKart: string,
  stintNumber: number,
  events: ParsedRaceEvent[],
  linkedLapsForTeam: LapItem[] | undefined,
  settings: RaceSettings | undefined,
): StintStats {
  if (!linkedLapsForTeam || linkedLapsForTeam.length === 0) return { kind: "no-data" };

  const teamPits = events.filter((e) => e.type === "pit" && e.team?.startKart === startKart);

  let startLap = 1;
  if (stintNumber > 1) {
    const prevPit = teamPits.find((e) => e.pitCount === stintNumber - 1);
    if (!prevPit || typeof prevPit.lapNumber !== "number") return { kind: "missing-lap-numbers" };
    startLap = prevPit.lapNumber + 1;
  }

  let endLap = Infinity;
  const currentPit = teamPits.find((e) => e.pitCount === stintNumber);
  if (currentPit) {
    if (typeof currentPit.lapNumber !== "number") return { kind: "missing-lap-numbers" };
    endLap = currentPit.lapNumber;
  }

  const ctx = buildLapFilterContext(settings);
  const excluded = computeExcludedLapCounts(linkedLapsForTeam, teamPits, ctx);
  const laps = linkedLapsForTeam.filter(
    (l) => l.lapCount >= startLap && l.lapCount <= endLap && !excluded.has(l.lapCount),
  );
  if (laps.length === 0) return { kind: "no-data" };

  const maxLapTimeForAverageSec = settings?.maxLapTimeForAverageSec;
  const maxMs =
    typeof maxLapTimeForAverageSec === "number" && maxLapTimeForAverageSec > 0
      ? maxLapTimeForAverageSec * 1000
      : Infinity;
  let sum = 0;
  let avgCount = 0;
  let best = Infinity;
  for (const l of laps) {
    if (l.time < best) best = l.time;
    if (l.time <= maxMs) {
      sum += l.time;
      avgCount++;
    }
  }
  const avg = avgCount > 0 ? sum / avgCount : null;
  return { kind: "ok", count: laps.length, avg, avgCount, best };
}

export interface TeamOnKart {
  name: string;
  startKart: string;
  stintNumber: number;
  timestamp?: number;
  isCurrent: boolean;
  isStarting: boolean;
  timeAgo?: string;
}

/** Every team stint that drove a given physical kart, ordered exactly like the
 * kart modal on the main page: current first, starting last, else newest-first
 * by the timestamp the team got onto the kart. */
export function getTeamsOnKart(
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  kartNumber: string,
): TeamOnKart[] {
  const kartTeams: TeamOnKart[] = [];

  const formatAgo = (from: number): string => {
    const diffMins = Math.floor((Date.now() - from) / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours > 0) return `${diffHours}ч ${diffMins % 60}м назад`;
    if (diffMins > 0) return `${diffMins}м назад`;
    return "только что";
  };

  Object.values(teams).forEach((team) => {
    if (!team.karts.includes(kartNumber)) return;

    const kartIndices = team.karts
      .map((kart, index) => (kart === kartNumber ? index : -1))
      .filter((index) => index !== -1);

    const currentKartIndex = team.karts.length - 1;
    const currentKart = team.karts[currentKartIndex];

    // One entry per time this team sat on this kart.
    kartIndices.forEach((kartIndex) => {
      const stintNumber = kartIndex + 1;
      const isStarting = team.startKart === kartNumber && kartIndex === 0;
      const isCurrent = currentKart === kartNumber && kartIndex === currentKartIndex;

      // When the team got onto this kart for this stint.
      let timestamp: number | undefined;
      if (!isStarting && kartIndex > 0) {
        const pitEvent = events.find(
          (event) =>
            event.type === "pit" &&
            event.team &&
            event.team.startKart === team.startKart &&
            event.pitCount === kartIndex,
        );
        timestamp = pitEvent?.timestamp;
        if (!timestamp) {
          const breakdownEvent = events.find(
            (event) =>
              event.type === "breakdown" &&
              event.kart === team.startKart &&
              event.newKart === kartNumber,
          );
          timestamp = breakdownEvent?.timestamp;
        }
      }

      let timeAgo: string | undefined;
      if (timestamp) {
        timeAgo = formatAgo(timestamp);
      } else if (isStarting) {
        const eventsWithTime = events.filter((event) => event.timestamp);
        if (eventsWithTime.length > 0) {
          timeAgo = formatAgo(Math.min(...eventsWithTime.map((event) => event.timestamp!)));
        }
      }

      kartTeams.push({ name: team.name, startKart: team.startKart, stintNumber, timestamp, isCurrent, isStarting, timeAgo });
    });
  });

  return kartTeams.sort((a, b) => {
    // Current entries first.
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    // Starting entries last.
    if (a.isStarting && !b.isStarting) return 1;
    if (!a.isStarting && b.isStarting) return -1;
    // Same team — newer stints on top.
    if (a.startKart === b.startKart) return b.stintNumber - a.stintNumber;
    // Otherwise newest-first by timestamp.
    if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Builds a map of `physicalKart -> bestLapMs` — the fastest lap recorded
 * on each physical kart by ANY team.
 *
 * Two timing systems with different lap.kart semantics:
 *   - sms-timing: `lap.kart` always equals the physical kart (changes after a pit).
 *   - racemann:   `lap.kart` always equals `team.rn` == `team.startKart`,
 *                 even when the team is on a different physical kart.
 *
 * For racemann we MUST split a team's laps into stint ranges and attribute
 * each lap to the physical kart that was being driven during that stint.
 * Direct attribution by `lap.kart` would attribute every lap of the team
 * to its startKart, which is wrong for stints 2+.
 */
/**
 * Canonical form of a kart number string. Handles "7" vs "07" mismatches
 * between user-entered kart numbers and timing-system lap.kart values.
 */
function normalizeKart(k: string | null | undefined): string {
  if (!k) return "";
  const trimmed = k.trim();
  if (!trimmed) return "";
  const num = parseInt(trimmed, 10);
  return Number.isFinite(num) && String(num) === trimmed.replace(/^0+(?=\d)/, "")
    ? String(num)
    : trimmed;
}

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

  // Phase 1: direct attribution by `lap.kart`. Only valid when `lap.kart` is
  // the PHYSICAL kart for that lap (sms-timing). When `lap.kart` is the team
  // identifier (racemann, getraceresults), Phase 1 would attribute every team
  // lap to the physical kart whose number happens to equal the team startKart,
  // which contaminates that physical kart's best with stints driven on other
  // karts. Skip Phase 1 in that case — Phase 2 handles the attribution.
  if (!lapKartIsTeamId) {
    for (const [kart, laps] of lapsByKart) {
      // sms-timing: lap.kart is the physical kart; team pit history would be
      // misleading here. Filter only by single-lap rules (min) — multi-lap
      // rules (after-long, after-pit, after-missing) need team context.
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

  // Phase 2: stint-range mapping. ONLY for team-id timing (racemann/getraceresults),
  // where lap.kart is the team id and `lapsByKart.get(startKart)` returns that
  // team's own laps — split into stints by pit lapNumbers and attributed to the
  // physical kart driven in each stint.
  //
  // Must NOT run for sms-timing: there `lapsByKart.get(startKart)` is the PHYSICAL
  // kart #startKart's laps (driven by every team that used it across the race), so
  // attributing its later laps to this team's stints 2+ leaks one kart's lap onto
  // another and corrupts the per-kart best. Phase 1 already attributes correctly.
  if (lapKartIsTeamId) {
    for (const team of Object.values(teams)) {
      const teamLaps = lapsByKart.get(team.startKart);
      if (!teamLaps || teamLaps.length === 0) continue;
      const teamPits = events.filter(
        (e) => e.type === "pit" && e.team?.startKart === team.startKart,
      );
      const excluded = computeExcludedLapCounts(teamLaps, teamPits, ctx);
      team.karts.forEach((physicalKart, stintIndex) => {
        const range = computeStintLapRange(teamPits, stintIndex);
        if (!range) return;
        for (const lap of teamLaps) {
          if (excluded.has(lap.lapCount)) continue;
          if (lap.lapCount >= range.startLap && lap.lapCount <= range.endLap) {
            setBest(physicalKart, lap.time);
          }
        }
      });
    }
  }

  return map;
}

// In EVERY timing system we ingest, `lap.kart` is the TEAM identifier (constant
// across the race), never the physical kart number. The physical kart driven in
// each stint is always derived from the team's pit history (Phase 2). Direct
// attribution by `lap.kart` (Phase 1) would treat a team id as a kart number and
// must never run.
function lapKartIsTeamIdHeat(): boolean {
  return true;
}

// Module-level memoization: every <Kart /> instance calls useKartBests, and
// each render would otherwise recompute the full physical-kart map. Cache by
// reference identity of the inputs (Zustand keeps refs stable until data
// actually changes), so all instances in the same render cycle share work.
let bestMapCache: {
  teams: Record<string, ParsedRaceTeam> | null;
  events: ParsedRaceEvent[] | null;
  lapsByKart: Map<string, LapItem[]> | null;
  lapKartIsTeamId: boolean | null;
  ctxKey: string | null;
  globalBest: number | null;
  result: Map<string, number> | null;
} = {
  teams: null,
  events: null,
  lapsByKart: null,
  lapKartIsTeamId: null,
  ctxKey: null,
  globalBest: null,
  result: null,
};

function ctxCacheKey(ctx: LapFilterContext): string {
  return `${ctx.minLapMs}|${ctx.excludeAfterLongMs ?? ""}|${ctx.excludeFirstAfterPit ? 1 : 0}|${ctx.excludeAfterMissingLap ? 1 : 0}`;
}

function getCachedBestByPhysicalKart(
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  lapsByKart: Map<string, LapItem[]>,
  lapKartIsTeamId: boolean,
  ctx: LapFilterContext,
): { map: Map<string, number>; globalBest: number | null } {
  const ctxKey = ctxCacheKey(ctx);
  if (
    bestMapCache.teams === teams &&
    bestMapCache.events === events &&
    bestMapCache.lapsByKart === lapsByKart &&
    bestMapCache.lapKartIsTeamId === lapKartIsTeamId &&
    bestMapCache.ctxKey === ctxKey &&
    bestMapCache.result !== null
  ) {
    return { map: bestMapCache.result, globalBest: bestMapCache.globalBest };
  }
  const result = computeBestByPhysicalKart(teams, events, lapsByKart, lapKartIsTeamId, ctx);
  let globalBest: number | null = null;
  for (const v of result.values()) {
    if (globalBest === null || v < globalBest) globalBest = v;
  }
  bestMapCache = { teams, events, lapsByKart, lapKartIsTeamId, ctxKey, result, globalBest };
  return { map: result, globalBest };
}

interface KartBestsResult {
  kartBest: number | null;
  globalBest: number | null;
}

export function useKartBests(kart: string): KartBestsResult {
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);
  const teams = useRaceStore((s) => s.teams);
  const events = useRaceStore((s) => s.events);
  const settings = useRaceStore((s) => s.raceData?.settings);
  const ctx = useMemo(() => buildLapFilterContext(settings), [settings]);

  const { map, globalBest } = useMemo(() => {
    if (!linkedHeat || !teams || !events || lapsByKart.size === 0) {
      return { map: null as Map<string, number> | null, globalBest: null as number | null };
    }
    const lapKartIsTeamId = lapKartIsTeamIdHeat();
    return getCachedBestByPhysicalKart(teams, events, lapsByKart, lapKartIsTeamId, ctx);
  }, [linkedHeat, teams, events, lapsByKart, ctx]);

  if (!map) return { kartBest: null, globalBest: null };
  return { kartBest: map.get(normalizeKart(kart)) ?? null, globalBest };
}

function computeStintLapRange(
  teamPits: ParsedRaceEvent[],
  stintIndex: number,
): { startLap: number; endLap: number } | null {
  const stintNumber = stintIndex + 1;
  let startLap = 1;
  if (stintNumber > 1) {
    const prevPit = teamPits.find((e) => e.pitCount === stintNumber - 1);
    if (!prevPit || typeof prevPit.lapNumber !== "number") return null;
    startLap = prevPit.lapNumber + 1;
  }
  let endLap = Infinity;
  const currentPit = teamPits.find((e) => e.pitCount === stintNumber);
  if (currentPit) {
    if (typeof currentPit.lapNumber !== "number") return null;
    endLap = currentPit.lapNumber;
  }
  return { startLap, endLap };
}

interface StintBestResult {
  stintBest: number | null;
  globalBest: number | null;
}

export function useStintBest(teamStartKart: string, stintIndex: number): StintBestResult {
  const linkedHeat = useLinkedHeatStore((s) => s.heat);
  const lapsByKart = useLinkedHeatStore((s) => s.lapsByKart);
  const teams = useRaceStore((s) => s.teams);
  const events = useRaceStore((s) => s.events);
  const settings = useRaceStore((s) => s.raceData?.settings);
  const ctx = useMemo(() => buildLapFilterContext(settings), [settings]);

  const stintBest = useMemo<number | null>(() => {
    if (!linkedHeat || !teams || !events) return null;
    const team = teams[teamStartKart];
    if (!team) return null;
    const teamLaps = lapsByKart.get(teamStartKart);
    if (!teamLaps || teamLaps.length === 0) return null;
    const teamPits = events.filter(
      (e) => e.type === "pit" && e.team?.startKart === teamStartKart,
    );
    const range = computeStintLapRange(teamPits, stintIndex);
    if (!range) return null;
    const excluded = computeExcludedLapCounts(teamLaps, teamPits, ctx);
    let best: number | null = null;
    for (const lap of teamLaps) {
      if (excluded.has(lap.lapCount)) continue;
      if (lap.lapCount >= range.startLap && lap.lapCount <= range.endLap) {
        if (best === null || lap.time < best) best = lap.time;
      }
    }
    return best;
  }, [linkedHeat, teams, events, lapsByKart, teamStartKart, stintIndex, ctx]);

  // globalBest re-uses the cached physical-kart map (same one as useKartBests).
  const globalBest = useMemo<number | null>(() => {
    if (!linkedHeat || !teams || !events || lapsByKart.size === 0) return null;
    const lapKartIsTeamId = lapKartIsTeamIdHeat();
    return getCachedBestByPhysicalKart(teams, events, lapsByKart, lapKartIsTeamId, ctx).globalBest;
  }, [linkedHeat, teams, events, lapsByKart, ctx]);

  return { stintBest, globalBest };
}
