import { Injectable, Logger } from '@nestjs/common';
import { SmtTimingDriver, SmtTimingMessage } from './sms-timing.types';
import { HeatStatus } from '@racing/shared';

export interface ParsedHeat {
  scheduledTimestamp: number;
  name: string;
  status: HeatStatus;
  meta: Record<string, any>;
}

export interface NewLap {
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  driverExternalId: number;
  meta: Record<string, any>;
}

@Injectable()
export class SmtTimingParser {
  private loggers = new Map<string, Logger>();
  private lastState = new Map<string, Map<number, SmtTimingDriver>>();

  private getLogger(kartodromId: string): Logger {
    let logger = this.loggers.get(kartodromId);
    if (!logger) {
      logger = new Logger(kartodromId);
      this.loggers.set(kartodromId, logger);
    }
    return logger;
  }

  parseMessage(kartodromId: string, raw: string): SmtTimingMessage | null {
    const logger = this.getLogger(kartodromId);
    try {
      const msg = JSON.parse(raw);
      if (!msg.D || !msg.N || msg.T === undefined) {
        logger.warn(`Message missing required fields (D, N, T): ${raw.substring(0, 100)}`);
        return null;
      }
      return msg as SmtTimingMessage;
    } catch {
      logger.warn(`Failed to parse message as JSON: ${raw.substring(0, 100)}`);
      return null;
    }
  }

  parseHeat(msg: SmtTimingMessage): ParsedHeat {
    return {
      scheduledTimestamp: msg.T,
      name: msg.N,
      status: this.resolveStatus(msg),
      meta: {
        rawStatus: msg.S,
        raceTime: msg.C,
        type: this.resolveType(msg.E),
        totalLaps: msg.L,
      },
    };
  }

  detectNewLaps(kartodromId: string, msg: SmtTimingMessage, isFirstMessage: boolean): NewLap[] {
    const logger = this.getLogger(kartodromId);
    const prevDrivers = this.lastState.get(kartodromId);
    const currentDrivers = new Map<number, SmtTimingDriver>();
    for (const d of msg.D) {
      currentDrivers.set(d.D, d);
    }

    this.lastState.set(kartodromId, currentDrivers);

    if (isFirstMessage) {
      logger.log(`Stored initial state: ${msg.D.length} drivers`);
      return [];
    }

    const newLaps: NewLap[] = [];

    for (const driver of msg.D) {
      if (driver.L === 0) continue;

      const prev = prevDrivers?.get(driver.D);
      const prevLapCount = prev?.L ?? 0;

      if (driver.L > prevLapCount) {
        newLaps.push({
          driverName: driver.N,
          kart: driver.K,
          position: driver.P,
          lapCount: driver.L,
          time: driver.T,
          driverExternalId: driver.D,
          meta: {
            avgTime: driver.A,
            bestTime: driver.B,
            gap: driver.G,
          },
        });
      }
    }

    return newLaps;
  }

  resetState(kartodromId: string): void {
    this.lastState.delete(kartodromId);
  }

  private resolveStatus(msg: SmtTimingMessage): HeatStatus {
    if (msg.CE === 0 && msg.CS === 0 && msg.C === 0) return HeatStatus.FINISHED;
    if (msg.CE === 0 && msg.CS === 0 && msg.C > 0) return HeatStatus.WAITING;
    if (msg.CE === 1 && msg.CS === 1) return HeatStatus.IN_PROGRESS;
    if (msg.S === 1) return HeatStatus.IN_PROGRESS;
    if (msg.S === 4) return HeatStatus.FINISHED;
    return HeatStatus.UNKNOWN;
  }

  private resolveType(e: number): string {
    if (e === 1) return 'time';
    if (e === 2) return 'laps';
    return 'unknown';
  }
}
