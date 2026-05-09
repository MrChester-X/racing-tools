import { HeatStatus } from '@racing/shared';
import {
  RacemannComp,
  RacemannLap,
  RacemannRaceStartData,
  RacemannStint,
} from './racemann.types';

const URL_RE = /^https?:\/\/([a-z0-9-]+)\.racemann\.com\/Race\/id\/([0-9a-f-]{36})/i;

export interface ParsedRacemannUrl {
  subdomain: string;
  raceId: string;
}

export interface RacemannHeatInput {
  kartodromId: string;
  scheduledTimestamp: number;
  name: string;
  status: HeatStatus;
  meta: Record<string, any>;
  passAt: Date | null;
}

export interface RacemannLapInput {
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  driverExternalId: number;
  meta: Record<string, any>;
  passAt: Date | null;
}

export interface RacemannStintPair {
  compRegNum: string;
  sessionNum: number;
}

export function parseRacemannUrl(url: string): ParsedRacemannUrl | null {
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { subdomain: m[1].toLowerCase(), raceId: m[2].toLowerCase() };
}

export function buildStintPairs(data: RacemannRaceStartData): RacemannStintPair[] {
  const compsWithLaps = new Set(
    data.comps.filter((c) => c.lc > 0).map((c) => c.rn),
  );
  return data.sessions
    .filter((s) => compsWithLaps.has(s.rn))
    .map((s) => ({ compRegNum: s.rn, sessionNum: s.n }));
}

export function buildHeatInput(
  data: RacemannRaceStartData,
  ctx: { name: string; subdomain: string; raceId: string },
): RacemannHeatInput {
  const isInProgress = data.adminRaceState?.isCurrent === true;
  const now = new Date();
  return {
    kartodromId: `racemann-${ctx.subdomain}`,
    scheduledTimestamp: Math.floor(now.getTime() / 1000),
    name: ctx.name,
    status: isInProgress ? HeatStatus.IN_PROGRESS : HeatStatus.FINISHED,
    passAt: isInProgress ? null : now,
    meta: {
      racemannRaceId: ctx.raceId,
      subdomain: ctx.subdomain,
      lapsComplete: data.lapsComplete,
      scheduledLaps: data.scheduledLaps,
      totalComps: data.comps.length,
      totalSessions: data.sessions.length,
      importedAt: now.toISOString(),
    },
  };
}

export function buildLapInputs(
  data: RacemannRaceStartData,
  sessionLaps: Map<string, RacemannLap[]>,
  onMissingStint?: (compRn: string, lapNum: number) => void,
): RacemannLapInput[] {
  const compByRn = new Map<string, RacemannComp>(data.comps.map((c) => [c.rn, c]));
  const stintsByComp = new Map<string, RacemannStint[]>();
  for (const s of data.sessions) {
    const arr = stintsByComp.get(s.rn) ?? [];
    arr.push(s);
    stintsByComp.set(s.rn, arr);
  }

  const results: RacemannLapInput[] = [];

  for (const [key, laps] of sessionLaps) {
    const [compRn] = key.split(':');
    const comp = compByRn.get(compRn);
    if (!comp) continue;
    const stints = stintsByComp.get(compRn) ?? [];

    for (const lap of laps) {
      const stint = stints.find((s) => lap.n >= s.ssl && lap.n <= s.sll);
      if (!stint && onMissingStint) onMissingStint(compRn, lap.n);

      const meta: Record<string, any> = { raceTimeMs: lap.rt };
      if (stint) {
        meta.stint = {
          num: stint.n,
          driver: stint.drv,
          startLap: stint.ssl,
          endLap: stint.sll,
          startMs: stint.ss,
          endMs: stint.se,
        };
      }
      if (lap.pd?.Time > 0) {
        meta.pit = { laps: lap.pd.Laps, timeMs: lap.pd.Time };
      }
      if (lap.S1 > 0 || lap.S2 > 0 || lap.S3 > 0) {
        meta.sectors = { S1: lap.S1, S2: lap.S2, S3: lap.S3 };
      }

      results.push({
        driverExternalId: parseInt(comp.rn, 10),
        driverName: comp.fn,
        kart: comp.rn,
        lapCount: lap.n,
        time: lap.lt,
        position: lap.p,
        meta,
        passAt: null,
      });
    }
  }

  return results;
}
