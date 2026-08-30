import { KartStint, ParsedRaceEvent, ParsedRaceTeam, RaceData, RaceSettings } from "../types";
import { LapItem } from "@/app/heats/types";
import { buildLapFilterContext, computeExcludedLapCounts } from "../lapFilters";

export type StintStats =
  | { kind: "ok"; count: number; avg: number | null; avgCount: number; best: number; driver: string | null }
  | { kind: "missing-lap-numbers" }
  | { kind: "no-data" };

export interface KartHistoryEntry {
  teamName: string;
  startKart: string;
  stintNumber: number;
  isStarting: boolean;
  isCurrent: boolean;
  stats: StintStats | null;
  startTime?: number;
}

export interface ReportInput {
  teams: Record<string, ParsedRaceTeam>;
  events: ParsedRaceEvent[];
  raceData: RaceData;
  pitlane: string[][];
  linkedHeat: { id: string; name: string } | null;
  linkedLapsByKart: Record<string, LapItem[]> | null;
}

// Имя пилота на круге. Импорт заезда по URL кладёт его в meta.stint.driver,
// live-воркер — в meta.session.driver; читаем оба, чтобы старые заезды в БД
// заработали без бэкфилла. Строка приходит от racemann склеенной с номером
// пилота ("41Малышев Владимир") и печатается как есть.
export function lapDriver(lap: LapItem): string | null {
  const meta = lap.meta as
    | { stint?: { driver?: string | null }; session?: { driver?: string | null } }
    | undefined;
  const raw = meta?.stint?.driver ?? meta?.session?.driver;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

// Пилот отрезка: один отрезок — один пилот, поэтому берём того, у кого в нём
// больше всего кругов.
//
// Просто «имя с первого круга» не годится: пит-события mega-secret-pits и
// стинты racemann разъезжаются на круг. В пит-событии записан круг, на котором
// команда заезжала в питы, а racemann относит этот круг уже к следующему
// стинту, так что последний круг отрезка несёт имя СЛЕДУЮЩЕГО пилота (на
// разобранной гонке так у 135 отрезков из 450). Большинство кругов гасит и
// этот пограничный круг, и запоздание оператора на пару кругов.
//
// Круги без имени (seed-круги live-воркера) не считаются — поэтому первый
// стинт старых заездов получает имя со следующего круга.
export function stintDriver(laps: LapItem[]): string | null {
  const lapsByDriver = new Map<string, number>();
  for (const lap of [...laps].sort((a, b) => a.lapCount - b.lapCount)) {
    const name = lapDriver(lap);
    if (name) lapsByDriver.set(name, (lapsByDriver.get(name) ?? 0) + 1);
  }
  let leader: string | null = null;
  let leaderLaps = 0;
  // Map хранит порядок вставки, поэтому при равенстве побеждает тот, чьи круги
  // в отрезке начались раньше.
  for (const [name, count] of lapsByDriver) {
    if (count > leaderLaps) {
      leader = name;
      leaderLaps = count;
    }
  }
  return leader;
}

export function formatLapTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : sec;
}

export function computeStintStats(
  startKart: string,
  stint: KartStint,
  events: ParsedRaceEvent[],
  linkedLapsForTeam: LapItem[] | undefined,
  settings: RaceSettings | undefined,
): StintStats {
  if (!linkedLapsForTeam || linkedLapsForTeam.length === 0) return { kind: "no-data" };
  if (stint.startLap === null || stint.unbounded) return { kind: "missing-lap-numbers" };
  const startLap = stint.startLap;
  const endLap = stint.endLap ?? Infinity;
  const teamPits = events.filter((e) => e.type === "pit" && e.team?.startKart === startKart);
  const ctx = buildLapFilterContext(settings);
  // Compute excluded set from the FULL team list — exclude-after-long and
  // exclude-after-missing need predecessor info that might live in an earlier
  // stint.
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
  // Пилота ищем по ВСЕМ кругам отрезка, а не по отфильтрованным: круг может
  // выпасть из статистики (пит, слишком долгий), но имя пилота на нём валидно.
  const driver = stintDriver(
    linkedLapsForTeam.filter((l) => l.lapCount >= startLap && l.lapCount <= endLap),
  );
  return { kind: "ok", count: laps.length, avg, avgCount, best, driver };
}

export function buildKartHistory(
  kartNumber: string,
  teams: Record<string, ParsedRaceTeam>,
  events: ParsedRaceEvent[],
  linkedLapsByKart: Record<string, LapItem[]> | null,
  linkedHeatPresent: boolean,
  settings: RaceSettings | undefined,
): KartHistoryEntry[] {
  const history: KartHistoryEntry[] = [];
  let earliestTs: number | undefined;
  for (const e of events) {
    if (e.timestamp !== undefined && (earliestTs === undefined || e.timestamp < earliestTs)) earliestTs = e.timestamp;
  }
  Object.values(teams).forEach((team) => {
    if (!team.kartStints.some((s) => s.kart === kartNumber)) return;
    // Boundary events (pits + breakdowns) in order map 1:1 to segments after the
    // first — segment i (i ≥ 1) was opened by boundary[i-1].
    const boundary = events.filter(
      (e) => (e.type === "pit" || e.type === "breakdown") && e.team?.startKart === team.startKart,
    );
    const lastIndex = team.kartStints.length - 1;
    team.kartStints.forEach((seg, stintIndex) => {
      if (seg.kart !== kartNumber) return;
      const stintNumber = stintIndex + 1;
      const isStarting = stintIndex === 0;
      const isCurrent = stintIndex === lastIndex;
      const startTime = stintIndex > 0 ? boundary[stintIndex - 1]?.timestamp : earliestTs;
      const stats = linkedHeatPresent
        ? computeStintStats(team.startKart, seg, events, linkedLapsByKart?.[team.startKart], settings)
        : null;
      history.push({ teamName: team.name, startKart: team.startKart, stintNumber, isStarting, isCurrent, stats, startTime });
    });
  });
  history.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime - b.startTime;
    if (a.startTime && !b.startTime) return 1;
    if (!a.startTime && b.startTime) return -1;
    return a.stintNumber - b.stintNumber;
  });
  return history;
}

export function getKartSummary(history: KartHistoryEntry[]): { best: number | null; bestAvg: number | null } {
  let best = Infinity;
  let bestAvg = Infinity;
  for (const p of history) {
    if (p.stats && p.stats.kind === "ok") {
      if (p.stats.best < best) best = p.stats.best;
      if (p.stats.avg !== null && p.stats.avg < bestAvg) bestAvg = p.stats.avg;
    }
  }
  return {
    best: best === Infinity ? null : best,
    bestAvg: bestAvg === Infinity ? null : bestAvg,
  };
}
