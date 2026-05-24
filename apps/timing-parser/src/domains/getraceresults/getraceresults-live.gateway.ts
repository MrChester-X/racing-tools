import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Heat } from '@racing/shared';
import { TimingService } from '../timing/timing.service';
import { backoffDelayMs } from '../racemann/live/retry';
import { GrrTrackConfig } from './getraceresults-live.config';
import { GrrLiveParser, ParsedHeatInfo } from './getraceresults-live.parser';
import { GrrSignalRClient } from './getraceresults-signalr.client';
import { igoraKartingConfig } from './track/igora-karting.config';
import { SignalRFrame } from './getraceresults.types';

const TRACKS: GrrTrackConfig[] = [igoraKartingConfig];
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_CAP_MS = 30_000;

@Injectable()
export class GrrLiveGateway implements OnModuleInit, OnModuleDestroy {
  private runners = new Map<string, TrackRunner>();

  constructor(private readonly timing: TimingService) {}

  onModuleInit(): void {
    for (const track of TRACKS) {
      const parser = new GrrLiveParser();
      const runner = new TrackRunner(track, parser, this.timing);
      this.runners.set(track.id, runner);
      runner.start();
    }
  }

  onModuleDestroy(): void {
    for (const runner of this.runners.values()) {
      runner.stop();
    }
    this.runners.clear();
  }
}

interface ExistingLapsEntry {
  lapCounts: Set<number>;
  times: Set<number>;
}

class TrackRunner {
  private readonly logger: Logger;
  private signalR: GrrSignalRClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private gotEventSinceConnect = false;
  private stopped = false;
  private currentHeat: Heat | null = null;
  private currentHeatName: string | null = null;
  private existingByKart = new Map<number, ExistingLapsEntry>();

  constructor(
    private readonly config: GrrTrackConfig,
    private readonly parser: GrrLiveParser,
    private readonly timing: TimingService,
  ) {
    this.logger = new Logger(`GrrLive(${config.id})`);
  }

  start(): void {
    this.openConnection().catch((err) => {
      this.logger.error(`Initial connect failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.signalR?.close();
    this.signalR = null;
  }

  private async openConnection(): Promise<void> {
    if (this.stopped) return;
    this.logger.log(`Opening connection`);
    this.parser.reset('reconnect');
    this.currentHeat = null;
    this.currentHeatName = null;
    this.gotEventSinceConnect = false;

    const pageInfo = await GrrSignalRClient.fetchPageInfo(this.config.urlName);
    const sr = new GrrSignalRClient(this.config.urlName, this.logger);
    this.signalR = sr;
    await sr.connect(pageInfo, {
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
      if (this.stopped) return;
      this.logger.error(`processFrame failed: ${(err as Error).message}`);
    }
  }

  private async processFrame(frame: SignalRFrame): Promise<void> {
    if (this.stopped) return;
    if (Array.isArray(frame?.M) && frame.M.length > 0 && !this.gotEventSinceConnect) {
      this.gotEventSinceConnect = true;
      if (this.reconnectAttempt > 0) {
        this.logger.log(
          `Connection healthy, resetting backoff (was attempt ${this.reconnectAttempt})`,
        );
        this.reconnectAttempt = 0;
      }
    }

    const out = this.parser.processFrame(frame);

    if (out.heatInfo) {
      await this.applyHeat(out.heatInfo);
    }

    if (out.laps.length === 0 || !this.currentHeat) return;

    for (const lap of out.laps) {
      if (this.stopped) return;
      const externalId = numericExternalId(lap.startNumber, lap.rowIndex);
      if (lap.isInitial && !this.shouldInsertInitial(lap, externalId)) {
        continue;
      }
      const ok = await this.timing.insertLap({
        heat: this.currentHeat,
        driverName: lap.driverName,
        kart: lap.kart,
        position: lap.position,
        lapCount: lap.lapCount,
        time: lap.timeMs,
        driverExternalId: externalId,
        meta: lap.meta,
        passAt: lap.isInitial ? null : new Date(),
      });
      if (ok) {
        this.rememberLap(externalId, lap.lapCount, lap.timeMs);
        this.logger.log(
          `${lap.isInitial ? 'Init' : 'New'} lap kart=${lap.kart} #${lap.lapCount} t=${lap.timeMs}ms pos=${lap.position}`,
        );
      }
    }
  }

  private shouldInsertInitial(
    lap: { lapCount: number; timeMs: number; lapCountMode: 'race' | 'session' },
    externalId: number,
  ): boolean {
    const entry = this.existingByKart.get(externalId);
    if (!entry) return true;
    if (lap.lapCountMode === 'race') {
      return !entry.lapCounts.has(lap.lapCount);
    }
    return !entry.times.has(lap.timeMs);
  }

  private rememberLap(externalId: number, lapCount: number, timeMs: number): void {
    let entry = this.existingByKart.get(externalId);
    if (!entry) {
      entry = { lapCounts: new Set(), times: new Set() };
      this.existingByKart.set(externalId, entry);
    }
    entry.lapCounts.add(lapCount);
    entry.times.add(timeMs);
  }

  private async applyHeat(info: ParsedHeatInfo): Promise<void> {
    const heatChanged = info.name !== this.currentHeatName;
    if (!heatChanged && this.currentHeat) {
      this.currentHeat = await this.timing.upsertHeat({
        kartodromId: this.config.id,
        scheduledTimestamp: this.currentHeat.scheduledTimestamp,
        name: this.currentHeat.name,
        status: info.status,
        meta: { ...this.currentHeat.meta, ...info.meta },
        passAt: this.currentHeat.passAt ?? null,
      });
      return;
    }

    const heat = await this.timing.upsertHeat({
      kartodromId: this.config.id,
      scheduledTimestamp: info.scheduledTimestamp,
      name: info.name,
      status: info.status,
      meta: info.meta,
      passAt: null,
    });
    this.currentHeat = heat;
    this.currentHeatName = info.name;
    await this.loadExistingLaps(heat);
    this.logger.log(`Active heat: "${info.name}" status=${info.status}`);
  }

  private async loadExistingLaps(heat: Heat): Promise<void> {
    this.existingByKart.clear();
    const rows = await this.timing.getLapsForHeat(heat.id);
    for (const r of rows) {
      let entry = this.existingByKart.get(r.driverExternalId);
      if (!entry) {
        entry = { lapCounts: new Set(), times: new Set() };
        this.existingByKart.set(r.driverExternalId, entry);
      }
      entry.lapCounts.add(r.lapCount);
      entry.times.add(r.time);
    }
    this.logger.log(`Loaded ${rows.length} existing laps for heat "${heat.name}"`);
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
      this.openConnection().catch((err) => {
        this.logger.error(`Reconnect failed: ${(err as Error).message}`);
        this.scheduleReconnect();
      });
    }, delay);
  }
}

function numericExternalId(startNumber: string, rowIndex: number): number {
  const n = parseInt(startNumber, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return rowIndex + 1;
}
