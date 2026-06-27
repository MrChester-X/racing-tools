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
import { GrrSignalRClient, NoActiveSessionError } from './getraceresults-signalr.client';
import { igoraKartingConfig } from './track/igora-karting.config';
import { GrrLap, SignalRFrame } from './getraceresults.types';

const TRACKS: GrrTrackConfig[] = [igoraKartingConfig];
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_CAP_MS = 30_000;
const NO_SESSION_RETRY_MS = 60_000;
// TEMPORARY: suffix for the parallel clean heat (see GrrTrackConfig.mirrorToV2Heat).
const V2_HEAT_SUFFIX = ' v2';

@Injectable()
export class GrrLiveGateway implements OnModuleInit, OnModuleDestroy {
  private runners = new Map<string, TrackRunner>();

  constructor(private readonly timing: TimingService) {}

  onModuleInit(): void {
    for (const track of TRACKS) {
      const parser = new GrrLiveParser({ remapSportKarts: track.remapSportKarts });
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
  // TEMPORARY: parallel clean heat, written only by us (see config.mirrorToV2Heat).
  private currentHeatV2: Heat | null = null;
  private existingByKartV2 = new Map<number, ExistingLapsEntry>();

  constructor(
    private readonly config: GrrTrackConfig,
    private readonly parser: GrrLiveParser,
    private readonly timing: TimingService,
  ) {
    this.logger = new Logger(`GrrLive(${config.id})`);
  }

  start(): void {
    this.openConnection().catch((err) => {
      this.reportConnectError('Initial connect', err as Error);
      this.scheduleReconnect(err as Error);
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
    this.currentHeatV2 = null;
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
      await this.insertLapInto(this.currentHeat, this.existingByKart, lap, externalId, 'primary');
      // TEMPORARY: mirror the same lap into the clean v2 heat.
      if (this.config.mirrorToV2Heat && this.currentHeatV2) {
        await this.insertLapInto(this.currentHeatV2, this.existingByKartV2, lap, externalId, 'v2');
      }
    }
  }

  private async insertLapInto(
    heat: Heat,
    existing: Map<number, ExistingLapsEntry>,
    lap: GrrLap,
    externalId: number,
    label: string,
  ): Promise<void> {
    if (lap.isInitial && !this.shouldInsertInitial(existing, lap, externalId)) {
      return;
    }
    const effectiveLapCount = this.resolveLapCount(existing, lap, externalId);
    const lapRow = {
      heat,
      driverName: lap.driverName,
      kart: lap.kart,
      position: lap.position,
      lapCount: effectiveLapCount,
      time: lap.timeMs,
      driverExternalId: externalId,
      meta: lap.meta,
      passAt: lap.isInitial ? null : new Date(),
    };
    // GAP-derived (race) laps are authoritative: overwrite any existing time for
    // this lap. Session laps keep the insert-or-ignore behaviour.
    const ok =
      lap.lapCountMode === 'race'
        ? await this.timing.upsertLap(lapRow)
        : await this.timing.insertLap(lapRow);
    if (ok) {
      this.rememberLap(existing, externalId, effectiveLapCount, lap.timeMs);
      this.logger.log(
        `[${label}] ${lap.isInitial ? 'Init' : 'New'} lap kart=${lap.kart} #${effectiveLapCount} t=${lap.timeMs}ms pos=${lap.position} mode=${lap.lapCountMode}`,
      );
    }
  }

  private shouldInsertInitial(
    existing: Map<number, ExistingLapsEntry>,
    lap: { lapCount: number; timeMs: number; lapCountMode: 'race' | 'session' },
    externalId: number,
  ): boolean {
    const entry = existing.get(externalId);
    if (!entry) return true;
    if (lap.lapCountMode === 'race') {
      return !entry.lapCounts.has(lap.lapCount);
    }
    return !entry.times.has(lap.timeMs);
  }

  private resolveLapCount(
    existing: Map<number, ExistingLapsEntry>,
    lap: { lapCount: number; lapCountMode: 'race' | 'session' },
    externalId: number,
  ): number {
    if (lap.lapCountMode === 'race') return lap.lapCount;
    const entry = existing.get(externalId);
    let max = 0;
    if (entry) {
      for (const n of entry.lapCounts) if (n > max) max = n;
    }
    return max + 1;
  }

  private rememberLap(
    existing: Map<number, ExistingLapsEntry>,
    externalId: number,
    lapCount: number,
    timeMs: number,
  ): void {
    let entry = existing.get(externalId);
    if (!entry) {
      entry = { lapCounts: new Set(), times: new Set() };
      existing.set(externalId, entry);
    }
    entry.lapCounts.add(lapCount);
    entry.times.add(timeMs);
  }

  private async applyHeat(info: ParsedHeatInfo): Promise<void> {
    // A heat is identified by (scheduledTimestamp, name) — the DB upsert key.
    // Comparing on name alone merged a genuinely new heat (new start time, same
    // title) into the previous one, so detect a change on either field.
    const heatChanged =
      !this.currentHeat ||
      info.scheduledTimestamp !== this.currentHeat.scheduledTimestamp ||
      info.name !== this.currentHeatName;
    if (!heatChanged && this.currentHeat) {
      this.currentHeat = await this.timing.upsertHeat({
        kartodromId: this.config.id,
        scheduledTimestamp: this.currentHeat.scheduledTimestamp,
        name: this.currentHeat.name,
        status: info.status,
        meta: { ...this.currentHeat.meta, ...info.meta },
        passAt: this.currentHeat.passAt ?? null,
      });
      // TEMPORARY: keep the v2 mirror's status/meta in sync.
      if (this.config.mirrorToV2Heat && this.currentHeatV2) {
        this.currentHeatV2 = await this.timing.upsertHeat({
          kartodromId: this.config.id,
          scheduledTimestamp: this.currentHeatV2.scheduledTimestamp,
          name: this.currentHeatV2.name,
          status: info.status,
          meta: { ...this.currentHeatV2.meta, ...info.meta },
          passAt: this.currentHeatV2.passAt ?? null,
        });
      }
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
    await this.loadExistingLaps(heat, this.existingByKart);
    this.logger.log(`Active heat: "${info.name}" status=${info.status}`);

    // TEMPORARY: spin up / switch to the parallel clean heat.
    if (this.config.mirrorToV2Heat) {
      const v2Name = `${info.name}${V2_HEAT_SUFFIX}`;
      this.currentHeatV2 = await this.timing.upsertHeat({
        kartodromId: this.config.id,
        scheduledTimestamp: info.scheduledTimestamp,
        name: v2Name,
        status: info.status,
        meta: info.meta,
        passAt: null,
      });
      await this.loadExistingLaps(this.currentHeatV2, this.existingByKartV2);
      this.logger.log(`Active heat (v2 mirror): "${v2Name}"`);
    }
  }

  private async loadExistingLaps(
    heat: Heat,
    target: Map<number, ExistingLapsEntry>,
  ): Promise<void> {
    target.clear();
    const rows = await this.timing.getLapsForHeat(heat.id);
    for (const r of rows) {
      let entry = target.get(r.driverExternalId);
      if (!entry) {
        entry = { lapCounts: new Set(), times: new Set() };
        target.set(r.driverExternalId, entry);
      }
      entry.lapCounts.add(r.lapCount);
      entry.times.add(r.time);
    }
    this.logger.log(`Loaded ${rows.length} existing laps for heat "${heat.name}"`);
  }

  private scheduleReconnect(lastError?: Error): void {
    if (this.stopped) return;
    if (this.reconnectTimer) return;

    const noSession = lastError instanceof NoActiveSessionError;
    const delay = noSession
      ? NO_SESSION_RETRY_MS
      : backoffDelayMs(this.reconnectAttempt, RECONNECT_BASE_MS, RECONNECT_CAP_MS);
    this.reconnectAttempt++;
    this.logger.log(
      `Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt}${noSession ? ', no active session' : ''})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      this.openConnection().catch((err) => {
        this.reportConnectError('Reconnect', err as Error);
        this.scheduleReconnect(err as Error);
      });
    }, delay);
  }

  private reportConnectError(label: string, err: Error): void {
    if (err instanceof NoActiveSessionError) {
      this.logger.log(`${label}: no active session`);
    } else {
      this.logger.error(`${label} failed: ${err.message}`);
    }
  }
}

function numericExternalId(startNumber: string, rowIndex: number): number {
  const n = parseInt(startNumber, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return rowIndex + 1;
}
