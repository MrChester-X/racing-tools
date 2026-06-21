import { useLinkedHeatStore } from "./useLinkedHeatStore";
import { KartStint, ParsedRaceEvent, ParsedRaceTeam, RaceSettings } from "../types";
import { LapItem } from "@/app/heats/types";
import { buildLapFilterContext, computeExcludedLapCounts } from "../lapFilters";
import { normalizeKart } from "./physicalKartBest";

export type StintStats =
  | { kind: "ok"; count: number; avg: number | null; avgCount: number; best: number }
  | { kind: "missing-lap-numbers" }
  | { kind: "no-data" };

/** Lap count / average / best for a single kart segment (a continuous run on one
 * kart, split by pits AND breakdowns), from the linked heat. */
export function computeStintStats(
  startKart: string,
  stint: KartStint,
  events: ParsedRaceEvent[],
  linkedLapsForTeam: LapItem[] | undefined,
  settings: RaceSettings | undefined,
): StintStats {
  if (!linkedLapsForTeam || linkedLapsForTeam.length === 0) return { kind: "no-data" };
  // A segment whose boundary lap is unknown can't be delimited — same as a
  // pit-stint without a lap number.
  if (stint.startLap === null || stint.unbounded) return { kind: "missing-lap-numbers" };

  const startLap = stint.startLap;
  const endLap = stint.endLap ?? Infinity;
  const teamPits = events.filter((e) => e.type === "pit" && e.team?.startKart === startKart);

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
  stint: KartStint;
  timestamp?: number;
  isCurrent: boolean;
  isStarting: boolean;
  timeAgo?: string;
}

/** Every kart segment that drove a given physical kart, ordered exactly like the
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

  let earliestTs: number | undefined;
  for (const e of events) {
    if (e.timestamp !== undefined && (earliestTs === undefined || e.timestamp < earliestTs)) earliestTs = e.timestamp;
  }

  Object.values(teams).forEach((team) => {
    if (!team.kartStints.some((s) => s.kart === kartNumber)) return;

    // The team's boundary events (pits + breakdowns) in order map 1:1 to its
    // segments after the first — segment i (i ≥ 1) was opened by boundary[i-1] —
    // so we read the "got on the kart" timestamp without re-matching by kart.
    const boundary = events.filter(
      (e) => (e.type === "pit" || e.type === "breakdown") && e.team?.startKart === team.startKart,
    );
    const lastIndex = team.kartStints.length - 1;

    team.kartStints.forEach((seg, idx) => {
      if (seg.kart !== kartNumber) return;
      const isStarting = idx === 0;
      const isCurrent = idx === lastIndex;
      const timestamp = idx > 0 ? boundary[idx - 1]?.timestamp : undefined;

      let timeAgo: string | undefined;
      if (timestamp !== undefined) timeAgo = formatAgo(timestamp);
      else if (isStarting && earliestTs !== undefined) timeAgo = formatAgo(earliestTs);

      kartTeams.push({
        name: team.name,
        startKart: team.startKart,
        stintNumber: idx + 1,
        stint: seg,
        timestamp,
        isCurrent,
        isStarting,
        timeAgo,
      });
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

interface KartBestsResult {
  kartBest: number | null;
  globalBest: number | null;
}

// The physical-kart best map is computed once per data change inside the linked
// heat store (see `bestByPhysicalKart` / `globalBestPhysical`). Here we only read
// the two primitive values for this kart — so a delta under a kart re-renders ONLY
// when ITS best or the global best actually changes, not on every incoming lap.
export function useKartBests(kart: string): KartBestsResult {
  const nk = normalizeKart(kart);
  const kartBest = useLinkedHeatStore((s) => s.bestByPhysicalKart.get(nk) ?? null);
  const globalBest = useLinkedHeatStore((s) => s.globalBestPhysical);
  return { kartBest, globalBest };
}
