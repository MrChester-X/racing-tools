import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Heat, HeatStatus } from '@racing/shared';
import { TimingService } from '../../timing/timing.service';
import { RacemannClient } from '../racemann.client';
import { RacemannComp, RacemannRaceStartData } from '../racemann.types';
import { racemannLiveConfig, RacemannLiveConfig } from './racemann-live.config';
import { RacemannLiveParser } from './racemann-live.parser';
import { backoffDelayMs } from './retry';
import {
  RacemannSignalRClient,
  SignalRFrame,
} from './racemann-signalr.client';

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_CAP_MS = 30_000;

@Injectable()
export class RacemannLiveGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RacemannLiveGateway.name);
  private readonly config: RacemannLiveConfig = racemannLiveConfig;

  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private signalR: RacemannSignalRClient | null = null;
  private currentRaceId: string | null = null;
  private currentHeat: Heat | null = null;
  private switching = false;
  private stopped = false;
  private reconnectAttempt = 0;
  private gotEventSinceConnect = false;

  constructor(
    private readonly client: RacemannClient,
    private readonly parser: RacemannLiveParser,
    private readonly timing: TimingService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Starting live gateway: subdomain=${this.config.subdomain} pollMs=${this.config.homeLastPollMs}`,
    );
    this.tick().catch((err) => this.logger.error(`Initial tick failed: ${err.message}`));
    this.pollTimer = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Poll tick failed: ${err.message}`));
    }, this.config.homeLastPollMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.signalR?.close();
    this.signalR = null;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.switching) return;
    let raceId: string | null;
    try {
      raceId = await this.client.getHomeLastRaceId(this.config.subdomain);
    } catch (err) {
      this.logger.warn(`/home/last failed: ${(err as Error).message}`);
      return;
    }
    if (!raceId) {
      this.logger.warn('No raceId found in /home/last');
      return;
    }
    if (raceId === this.currentRaceId && this.signalR) {
      return;
    }
    await this.switchToRace(raceId);
  }

  private async switchToRace(raceId: string): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.logger.log(`Switching to race ${raceId} (was ${this.currentRaceId ?? 'none'})`);
      this.signalR?.close();
      this.signalR = null;
      this.gotEventSinceConnect = false;

      const startData = await this.client.getRaceStartData(this.config.subdomain, raceId);
      const heat = await this.upsertHeat(raceId, startData);
      this.currentHeat = heat;
      this.currentRaceId = raceId;

      await this.timing.insertRawMessage(this.config.kartodromId, {
        kind: 'startData',
        raceId,
        data: startData,
      });

      const seedLaps = this.parser.seed(startData);
      let inserted = 0;
      for (const lap of seedLaps) {
        const ok = await this.timing.insertLap({ heat, ...lap, passAt: null });
        if (ok) inserted++;
      }
      this.logger.log(`Seeded ${inserted}/${seedLaps.length} laps from lastLaps`);

      await this.openSignalR(raceId);
    } catch (err) {
      this.logger.error(`switchToRace failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    } finally {
      this.switching = false;
    }
  }

  private async openSignalR(raceId: string): Promise<void> {
    const sr = new RacemannSignalRClient(this.config.subdomain);
    this.signalR = sr;

    await sr.connect(raceId, {
      onMessage: (frame) => this.handleFrame(frame),
      onClose: (reason) => {
        this.logger.warn(`SignalR closed: ${reason}`);
        if (this.signalR === sr) {
          this.signalR = null;
          this.scheduleReconnect();
        }
      },
    });
  }

  private async handleFrame(frame: SignalRFrame): Promise<void> {
    try {
      await this.processFrame(frame);
    } catch (err) {
      if (this.stopped || isPoolEndedError(err)) return;
      this.logger.error(`processFrame failed: ${(err as Error).message}`);
    }
  }

  private async processFrame(frame: SignalRFrame): Promise<void> {
    if (this.stopped) return;
    if (!this.currentHeat || !this.currentRaceId) return;

    await this.timing.insertRawMessage(this.config.kartodromId, {
      kind: 'frame',
      raceId: this.currentRaceId,
      data: frame.parsed,
    });

    const messages = Array.isArray(frame.parsed?.M) ? frame.parsed.M : [];
    if (messages.length > 0 && !this.gotEventSinceConnect) {
      this.gotEventSinceConnect = true;
      if (this.reconnectAttempt > 0) {
        this.logger.log(`Connection healthy, resetting backoff (was attempt ${this.reconnectAttempt})`);
        this.reconnectAttempt = 0;
      }
    }
    for (const m of messages) {
      if (this.stopped) return;
      if (m?.M !== 'newCommand') continue;
      const args = Array.isArray(m.A) ? m.A : [];
      for (const arg of args) {
        if (this.stopped) return;
        if (arg?.Method !== 'Comp') continue;
        const command = arg.Command as RacemannComp | undefined;
        if (!command) continue;
        const newLap = this.parser.applyCompCommand(command);
        if (!newLap) continue;
        const ok = await this.timing.insertLap({
          heat: this.currentHeat,
          ...newLap,
          passAt: new Date(),
        });
        if (ok) {
          this.logger.log(
            `New lap rn=${newLap.kart} #${newLap.lapCount} t=${newLap.time}ms pos=${newLap.position}`,
          );
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return;

    const delay = backoffDelayMs(this.reconnectAttempt, RECONNECT_BASE_MS, RECONNECT_CAP_MS);
    this.reconnectAttempt++;
    this.logger.log(
      `Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      const raceId = this.currentRaceId;
      if (!raceId) return;
      this.switchToRace(raceId).catch((err) =>
        this.logger.error(`Reconnect failed: ${err.message}`),
      );
    }, delay);
  }

  private async upsertHeat(raceId: string, data: RacemannRaceStartData): Promise<Heat> {
    const settings = data.raceSettings;
    const raceData = data.raceData;

    const startMs = settings?.Start ? Date.parse(settings.Start) : NaN;
    const scheduledTimestamp = Number.isFinite(startMs)
      ? Math.floor(startMs / 1000)
      : Math.floor(Date.now() / 1000);
    const name = settings?.RaceName || raceData?.Name || raceId.slice(0, 8);

    const status = resolveHeatStatus(data);
    const passAt = status === HeatStatus.IN_PROGRESS ? null : new Date();

    return this.timing.upsertHeat({
      kartodromId: this.config.kartodromId,
      scheduledTimestamp,
      name,
      status,
      passAt,
      meta: {
        racemannRaceId: raceId,
        raceSettingsId: settings?.Id ?? null,
        subdomain: this.config.subdomain,
        flagStatus: raceData?.FlagStatus ?? null,
        lapsComplete: raceData?.LapsComplete ?? data.lapsComplete,
        scheduledLaps: raceData?.ScheduledLaps ?? data.scheduledLaps,
        startedAt: settings?.Start ?? null,
        endedAt: settings?.End ?? null,
        trackId: settings?.TrackId ?? null,
        isTimeAttackMode: settings?.IsTimeAttackMode ?? false,
      },
    });
  }
}

function resolveHeatStatus(data: RacemannRaceStartData): HeatStatus {
  const rd = data.raceData;
  const settings = data.raceSettings;
  if (rd?.IsComplete || settings?.End) return HeatStatus.FINISHED;
  if (data.adminRaceState?.isCurrent) return HeatStatus.IN_PROGRESS;
  if (rd?.RaceTime && rd.RaceTime > 0) return HeatStatus.IN_PROGRESS;
  if (settings?.Start) return HeatStatus.WAITING;
  return HeatStatus.UNKNOWN;
}

function isPoolEndedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Cannot use a pool after calling end on the pool');
}
