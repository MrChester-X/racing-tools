import { useLinkedHeatStore } from "./useLinkedHeatStore";
import { ParsedRaceEvent, ParsedRaceTeam, RaceSettings } from "../types";
import { LapItem } from "@/app/heats/types";
import { buildLapFilterContext, computeExcludedLapCounts } from "../lapFilters";
import { normalizeKart } from "./physicalKartBest";

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
