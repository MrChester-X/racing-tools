import { useMemo } from "react";
import { useRaceStore } from "../store/useRaceStore";
import { useLinkedHeatStore } from "./useLinkedHeatStore";
import { ParsedRaceEvent, ParsedRaceTeam } from "../types";
import { LapItem } from "@/app/heats/types";

export function computeBestByPhysicalKart(
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  lapsByKart: Map<string, LapItem[]>,
): Map<string, number> {
  const map = new Map<string, number>();

  const setBest = (kart: string, time: number) => {
    const prev = map.get(kart);
    if (prev === undefined || time < prev) map.set(kart, time);
  };

  // 1) Прямые попадания (sms-timing после pit'а — lap.kart = физический карт).
  for (const [kart, laps] of lapsByKart) {
    for (const lap of laps) setBest(kart, lap.time);
  }

  // 2) Стинт-маппинг (racemann — lap.kart = team rn == team.startKart).
  // Для каждого стинта команды смотрим, какой у неё был физический карт (team.karts[stintIndex]),
  // достаём её круги (lapsByKart.get(team.startKart)) и режем по диапазону lapNumber'ов pit-событий.
  for (const team of Object.values(teams)) {
    const teamLaps = lapsByKart.get(team.startKart);
    if (!teamLaps || teamLaps.length === 0) continue;
    const teamPits = events.filter((e) => e.type === "pit" && e.team?.startKart === team.startKart);

    team.karts.forEach((physicalKart, stintIndex) => {
      const stintNumber = stintIndex + 1;
      let startLap = 1;
      if (stintNumber > 1) {
        const prevPit = teamPits.find((e) => e.pitCount === stintNumber - 1);
        if (!prevPit || typeof prevPit.lapNumber !== "number") return;
        startLap = prevPit.lapNumber + 1;
      }
      let endLap = Infinity;
      const currentPit = teamPits.find((e) => e.pitCount === stintNumber);
      if (currentPit) {
        if (typeof currentPit.lapNumber !== "number") return;
        endLap = currentPit.lapNumber;
      }
      for (const lap of teamLaps) {
        if (lap.lapCount >= startLap && lap.lapCount <= endLap) {
          setBest(physicalKart, lap.time);
        }
      }
    });
  }

  return map;
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

  // Кешируем целиком map по ключу (длина массивов), чтобы не пересчитывать на каждый kart-instance.
  const map = useMemo(() => {
    if (!linkedHeat || !teams || !events || lapsByKart.size === 0) return null;
    return computeBestByPhysicalKart(teams, events, lapsByKart);
  }, [linkedHeat, teams, events, lapsByKart]);

  if (!map) return { kartBest: null, globalBest: null };
  const kartBest = map.get(kart) ?? null;
  const globalBest = map.size > 0 ? Math.min(...map.values()) : null;
  return { kartBest, globalBest };
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
  const bestByKart = useLinkedHeatStore((s) => s.bestByKart);
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

  const globalBest = useMemo<number | null>(() => {
    if (bestByKart.size === 0) return null;
    return Math.min(...bestByKart.values());
  }, [bestByKart]);

  return { stintBest, globalBest };
}
