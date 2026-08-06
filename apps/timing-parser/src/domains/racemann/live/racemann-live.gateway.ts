import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { TimingService } from '../../timing/timing.service';
import { RacemannClient } from '../racemann.client';
import { racemannLiveConfigs } from './racemann-live.config';
import { RacemannLiveWorker } from './racemann-live.worker';

@Injectable()
export class RacemannLiveGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RacemannLiveGateway.name);
  private readonly workers: RacemannLiveWorker[] = [];

  constructor(
    private readonly client: RacemannClient,
    private readonly timing: TimingService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Starting ${racemannLiveConfigs.length} live worker(s)`);
    for (const config of racemannLiveConfigs) {
      const worker = new RacemannLiveWorker(config, this.client, this.timing);
      this.workers.push(worker);
      worker.start();
    }
  }

  onModuleDestroy(): void {
    for (const worker of this.workers) {
      worker.stop();
    }
    this.workers.length = 0;
  }
}
