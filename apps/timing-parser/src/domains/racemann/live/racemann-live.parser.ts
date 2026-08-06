import { Logger } from '@nestjs/common';
import {
  RacemannComp,
  RacemannLastLap,
  RacemannRaceStartData,
} from '../racemann.types';
import { NewLap } from './racemann-live.types';

/** Per-race lap state; each live worker owns its own instance. */
export class RacemannLiveParser {
  private readonly logger = new Logger(RacemannLiveParser.name);
  private lastLapByRn = new Map<string, number>();
  private compByRn = new Map<string, RacemannComp>();

  reset(): void {
    this.lastLapByRn.clear();
    this.compByRn.clear();
  }

  seed(data: RacemannRaceStartData): NewLap[] {
    this.reset();
    for (const comp of data.comps) {
      this.compByRn.set(comp.rn, comp);
      this.lastLapByRn.set(comp.rn, comp.lc);
    }

    const laps: NewLap[] = [];
    for (const ll of data.lastLaps) {
      const comp = this.compByRn.get(ll.rn);
      if (!comp) continue;
      laps.push(this.buildLapFromLastLap(comp, ll));
    }
    return laps;
  }

  applyCompCommand(command: RacemannComp): NewLap | null {
    if (!command || !command.rn) return null;
    const prev = this.lastLapByRn.get(command.rn) ?? 0;
    this.compByRn.set(command.rn, command);

    if (!command.lc || command.lc <= prev) {
      this.lastLapByRn.set(command.rn, Math.max(prev, command.lc ?? 0));
      return null;
    }

    if (command.lc > prev + 1) {
      this.logger.warn(
        `Lap gap for rn=${command.rn}: ${prev} -> ${command.lc}; missed ${command.lc - prev - 1}`,
      );
    }

    this.lastLapByRn.set(command.rn, command.lc);
    return this.buildLapFromComp(command);
  }

  private buildLapFromLastLap(comp: RacemannComp, ll: RacemannLastLap): NewLap {
    return {
      driverName: comp.fn || comp.rn,
      kart: comp.rn,
      position: ll.p ?? 0,
      lapCount: ll.n,
      time: ll.lt,
      driverExternalId: parseRegNum(comp.rn),
      meta: buildLapMeta({
        raceTimeMs: ll.rt,
        lapState: ll.ls,
        posDiff: ll.pd,
        sectors: { S1: ll.S1, S2: ll.S2, S3: ll.S3 },
      }),
    };
  }

  private buildLapFromComp(comp: RacemannComp): NewLap {
    return {
      driverName: comp.fn || comp.rn,
      kart: comp.rn,
      position: comp.pos ?? 0,
      lapCount: comp.lc,
      time: comp.ll,
      driverExternalId: parseRegNum(comp.rn),
      meta: buildLapMeta({
        raceTimeMs: comp.pt,
        lapState: comp.ls,
        posDiff: comp.pd,
        sectors: { S1: comp.S1, S2: comp.S2, S3: comp.S3 },
        sessionNum: comp.cs?.n,
        sessionDriver: comp.cs?.drv ?? null,
        sessionCar: comp.cs?.Car ?? null,
      }),
    };
  }
}

function parseRegNum(rn: string): number {
  const n = parseInt(rn, 10);
  return Number.isFinite(n) ? n : 0;
}

function buildLapMeta(parts: {
  raceTimeMs: number;
  lapState: number;
  posDiff: { Laps: number; Time: number };
  sectors: { S1: number; S2: number; S3: number };
  sessionNum?: number;
  sessionDriver?: string | null;
  sessionCar?: string | null;
}): Record<string, any> {
  const meta: Record<string, any> = { raceTimeMs: parts.raceTimeMs };
  if (parts.lapState && parts.lapState !== 0) meta.lapState = parts.lapState;
  if (parts.posDiff && (parts.posDiff.Laps !== 0 || parts.posDiff.Time !== 0)) {
    meta.posDiff = { laps: parts.posDiff.Laps, timeMs: parts.posDiff.Time };
  }
  const { S1, S2, S3 } = parts.sectors;
  if (S1 > 0 || S2 > 0 || S3 > 0) {
    meta.sectors = { S1, S2, S3 };
  }
  if (parts.sessionNum !== undefined) {
    meta.session = {
      num: parts.sessionNum,
      driver: parts.sessionDriver ?? null,
      car: parts.sessionCar ?? null,
    };
  }
  return meta;
}
