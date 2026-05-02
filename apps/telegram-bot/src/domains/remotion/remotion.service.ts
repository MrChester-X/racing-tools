import { Injectable, Logger } from '@nestjs/common';
import { renderMediaOnLambda, getRenderProgress, AwsRegion } from '@remotion/lambda/client';
import { Driver } from '../parser/classes/driver.class';
import { LapData, RaceLapEvent } from './remotion.types';

export interface LambdaRenderHandle {
  renderId: string;
  bucketName: string;
}

export interface LambdaProgressResult {
  done: boolean;
  outputFile?: string;
  fatalError?: string;
}

@Injectable()
export class RemotionService {
  private readonly logger = new Logger(RemotionService.name);
  private readonly functionName = process.env.REMOTION_FUNCTION_NAME!;
  private readonly serveUrl = process.env.REMOTION_SERVE_URL!;
  private readonly region = process.env.REMOTION_REGION as AwsRegion;

  constructor() {
    process.env.AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID!;
    process.env.AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY!;
  }

  /**
   * Start a Lambda render (non-blocking). Returns renderId + bucketName to poll later.
   */
  async startLambdaRender(
    driver: Driver,
    offset: number,
    sourceVideoUrl: string,
    allDrivers: Driver[] = [],
  ): Promise<LambdaRenderHandle> {
    const inputProps = this.buildInputProps(driver, offset, sourceVideoUrl, allDrivers);

    const { renderId, bucketName } = await renderMediaOnLambda({
      region: this.region,
      functionName: this.functionName,
      serveUrl: this.serveUrl,
      composition: 'RaceOverlayWithVideo',
      codec: 'h264',
      timeoutInMilliseconds: 600000,
      inputProps,
    });

    this.logger.log(`Lambda render started: renderId=${renderId}`);
    return { renderId, bucketName };
  }

  /**
   * Check progress of a Lambda render. Returns done/outputFile or fatalError.
   */
  async checkLambdaProgress(renderId: string, bucketName: string): Promise<LambdaProgressResult> {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: this.functionName,
      region: this.region,
    });

    if (progress.fatalErrorEncountered) {
      return { done: true, fatalError: progress.errors?.[0]?.message || 'Unknown render error' };
    }

    if (progress.done) {
      return { done: true, outputFile: progress.outputFile! };
    }

    return { done: false };
  }

  private buildInputProps(driver: Driver, offset: number, sourceVideoUrl: string, allDrivers: Driver[] = []) {
    const laps = this.buildLapData(driver);
    const raceLapEvents = this.buildRaceLapEvents(allDrivers);
    return {
      laps,
      totalLaps: driver.laps.length,
      offsetSeconds: offset,
      driverName: driver.name,
      driverPosition: driver.index + 1,
      totalDrivers: allDrivers.length || 10,
      sourceVideoUrl,
      raceLapEvents,
    };
  }

  private buildRaceLapEvents(allDrivers: Driver[]): RaceLapEvent[] {
    const events: RaceLapEvent[] = [];
    for (const driver of allDrivers) {
      for (const lap of driver.laps) {
        if (lap.isPit()) continue;
        events.push({
          driverName: driver.name,
          kart: driver.kart,
          time: lap.time,
          absoluteEndTime: lap.getAbsoluteEndTime(),
        });
      }
    }
    return events.sort((a, b) => a.absoluteEndTime - b.absoluteEndTime);
  }

  buildLapData(driver: Driver): LapData[] {
    let bestTime = Infinity;
    return driver.laps.map((lap) => {
      const isBestSoFar = lap.time < bestTime;
      if (isBestSoFar) bestTime = lap.time;
      return {
        count: lap.count,
        time: lap.time,
        absoluteStartTime: lap.getAbsoluteStartTime(),
        absoluteEndTime: lap.getAbsoluteEndTime(),
        isBestSoFar,
      };
    });
  }
}
