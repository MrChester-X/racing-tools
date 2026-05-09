import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TimingService } from '../timing/timing.service';
import { RacemannClient } from './racemann.client';
import {
  buildHeatInput,
  buildLapInputs,
  buildStintPairs,
  parseRacemannUrl,
  RacemannStintPair,
} from './racemann.mapper';
import { RacemannLap } from './racemann.types';

const CHUNK_SIZE = 10;

export interface ImportResult {
  heatId: string;
  heatName: string;
  lapsInserted: number;
  stintsFetched: number;
  errors: Array<{ stint: string; message: string }>;
}

@Injectable()
export class RacemannService {
  private readonly logger = new Logger(RacemannService.name);

  constructor(
    private readonly client: RacemannClient,
    private readonly timing: TimingService,
  ) {}

  async importRace(url: string, name: string): Promise<ImportResult> {
    const parsed = parseRacemannUrl(url);
    if (!parsed) {
      throw new BadRequestException('Invalid racemann race URL');
    }
    const { subdomain, raceId } = parsed;
    const startedAt = Date.now();
    this.logger.log(`Import started: raceId=${raceId} subdomain=${subdomain}`);

    let startData;
    try {
      startData = await this.client.getRaceStartData(subdomain, raceId);
    } catch (err) {
      this.logger.warn(`GetRaceStartData failed: ${(err as Error).message}`);
      throw new BadGatewayException('Failed to fetch race data from racemann');
    }

    const pairs = buildStintPairs(startData);
    const sessionLaps = new Map<string, RacemannLap[]>();
    const errors: Array<{ stint: string; message: string }> = [];

    for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((p) => this.fetchPair(subdomain, raceId, p)),
      );
      results.forEach((r, idx) => {
        const key = `${chunk[idx].compRegNum}:${chunk[idx].sessionNum}`;
        if (r.status === 'fulfilled') {
          sessionLaps.set(key, r.value);
        } else {
          const message = (r.reason as Error).message;
          errors.push({ stint: key, message });
          this.logger.warn(`Stint fetch failed: ${key}: ${message}`);
        }
      });
    }

    if (pairs.length > 0 && errors.length === pairs.length) {
      throw new BadGatewayException('Failed to fetch laps from racemann');
    }

    const heatInput = buildHeatInput(startData, { name, subdomain, raceId });
    const heat = await this.timing.upsertHeat(heatInput);

    const lapInputs = buildLapInputs(startData, sessionLaps, (rn, lapNum) =>
      this.logger.warn(`No stint covers lap: rn=${rn} lap=${lapNum}`),
    );
    let lapsInserted = 0;
    for (const lap of lapInputs) {
      const ok = await this.timing.insertLap({ heat, ...lap });
      if (ok) lapsInserted++;
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Import finished: ${ms}ms, ${lapsInserted} laps, ${sessionLaps.size} stints, ${errors.length} errors`,
    );

    return {
      heatId: heat.id,
      heatName: heat.name,
      lapsInserted,
      stintsFetched: sessionLaps.size,
      errors,
    };
  }

  private async fetchPair(
    subdomain: string,
    raceId: string,
    pair: RacemannStintPair,
  ): Promise<RacemannLap[]> {
    const res = await this.client.getSessionLaps(subdomain, raceId, pair.compRegNum, pair.sessionNum);
    return res.laps;
  }
}
