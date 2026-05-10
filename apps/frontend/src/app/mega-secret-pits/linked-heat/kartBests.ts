import { useMemo } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "./useLinkedHeatStore";
import { ParsedRaceEvent, ParsedRaceTeam } from "../types";
import { LapItem } from "@/app/heats/types";

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
  _isRacemann: boolean = false,
): Map<string, number> {
  const map = new Map<string, number>();

  const setBest = (kart: string, time: number) => {
    if (time <= 0) return;
    const k = normalizeKart(kart);
    if (!k) return;
    const prev = map.get(k);
    if (prev === undefined || time < prev) map.set(k, time);
  };

  // Phase 1: direct attribution by `lap.kart`. Correct for sms-timing
  // (lap.kart = physical kart after each pit) and gives a base for racemann
  // teams that started on this kart.
  for (const [kart, laps] of lapsByKart) {
    for (const lap of laps) setBest(kart, lap.time);
  }

  // Phase 2: stint-range mapping. Required for racemann (lap.kart = team rn,
  // never changes; only pit-event lapNumbers can split stints across the
  // team's physical karts). Harmless for sms-timing — same laps re-applied,
  // setBest is a no-op when value isn't smaller.
  for (const team of Object.values(teams)) {
    const teamLaps = lapsByKart.get(team.startKart);
    if (!teamLaps || teamLaps.length === 0) continue;
    const teamPits = events.filter(
      (e) => e.type === "pit" && e.team?.startKart === team.startKart,
    );
    team.karts.forEach((physicalKart, stintIndex) => {
      const range = computeStintLapRange(teamPits, stintIndex);
      if (!range) return;
      for (const lap of teamLaps) {
        if (lap.lapCount >= range.startLap && lap.lapCount <= range.endLap) {
          setBest(physicalKart, lap.time);
        }
      }
    });
  }

  return map;
}

function isRacemannHeat(kartodromId: string | undefined | null): boolean {
  return typeof kartodromId === "string" && kartodromId.startsWith("racemann-");
}

// Module-level memoization: every <Kart /> instance calls useKartBests, and
// each render would otherwise recompute the full physical-kart map. Cache by
// reference identity of the inputs (Zustand keeps refs stable until data
// actually changes), so all instances in the same render cycle share work.
let bestMapCache: {
  teams: Record<string, ParsedRaceTeam> | null;
  events: ParsedRaceEvent[] | null;
  lapsByKart: Map<string, LapItem[]> | null;
  isRacemann: boolean | null;
  globalBest: number | null;
  result: Map<string, number> | null;
} = {
  teams: null,
  events: null,
  lapsByKart: null,
  isRacemann: null,
  globalBest: null,
  result: null,
};

function getCachedBestByPhysicalKart(
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  lapsByKart: Map<string, LapItem[]>,
  isRacemann: boolean,
): { map: Map<string, number>; globalBest: number | null } {
  if (
    bestMapCache.teams === teams &&
    bestMapCache.events === events &&
    bestMapCache.lapsByKart === lapsByKart &&
    bestMapCache.isRacemann === isRacemann &&
    bestMapCache.result !== null
  ) {
    return { map: bestMapCache.result, globalBest: bestMapCache.globalBest };
  }
  const result = computeBestByPhysicalKart(teams, events, lapsByKart, isRacemann);
  let globalBest: number | null = null;
  for (const v of result.values()) {
    if (globalBest === null || v < globalBest) globalBest = v;
  }
  bestMapCache = { teams, events, lapsByKart, isRacemann, result, globalBest };
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

  const { map, globalBest } = useMemo(() => {
    if (!linkedHeat || !teams || !events || lapsByKart.size === 0) {
      return { map: null as Map<string, number> | null, globalBest: null as number | null };
    }
    const isRacemann = isRacemannHeat(linkedHeat.kartodromId);
    return getCachedBestByPhysicalKart(teams, events, lapsByKart, isRacemann);
  }, [linkedHeat, teams, events, lapsByKart]);

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
    let best: number | null = null;
    for (const lap of teamLaps) {
      if (lap.lapCount >= range.startLap && lap.lapCount <= range.endLap) {
        if (best === null || lap.time < best) best = lap.time;
      }
    }
    return best;
  }, [linkedHeat, teams, events, lapsByKart, teamStartKart, stintIndex]);

  // globalBest re-uses the cached physical-kart map (same one as useKartBests).
  const globalBest = useMemo<number | null>(() => {
    if (!linkedHeat || !teams || !events || lapsByKart.size === 0) return null;
    const isRacemann = isRacemannHeat(linkedHeat.kartodromId);
    return getCachedBestByPhysicalKart(teams, events, lapsByKart, isRacemann).globalBest;
  }, [linkedHeat, teams, events, lapsByKart]);

  return { stintBest, globalBest };
}
