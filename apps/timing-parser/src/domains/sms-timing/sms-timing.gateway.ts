import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as WebSocket from 'ws';
import { KartodromConfig } from './kartodrom/kartodrom.config';
import { SmtTimingParser } from './sms-timing.parser';
import { TimingService } from '../timing/timing.service';
import { pitstopPremiumConfig } from './kartodrom/pitstop-premium.config';
import { pitstopNarvskayaConfig } from './kartodrom/pitstop-narvskaya.config';

const KARTODROM_CONFIGS: KartodromConfig[] = [pitstopPremiumConfig, pitstopNarvskayaConfig];

@Injectable()
export class SmtTimingGateway implements OnModuleInit, OnModuleDestroy {
  private connections = new Map<string, WebSocket>();
  private loggers = new Map<string, Logger>();
  private isFirstMessage = new Map<string, boolean>();
  private shouldReconnect = true;

  constructor(
    private readonly parser: SmtTimingParser,
    private readonly timingService: TimingService,
  ) {}

  onModuleInit() {
    for (const config of KARTODROM_CONFIGS) {
      this.loggers.set(config.id, new Logger(config.id));
      this.connect(config);
    }
  }

  onModuleDestroy() {
    this.shouldReconnect = false;
    for (const [id, ws] of this.connections) {
      this.log(id, 'Closing connection');
      ws.close();
    }
    this.connections.clear();
  }

  private connect(config: KartodromConfig) {
    this.log(config.id, `Connecting to ${config.wsUrl}`);
    this.isFirstMessage.set(config.id, true);
    this.parser.resetState(config.id);

    const ws = new WebSocket(config.wsUrl);
    this.connections.set(config.id, ws);

    ws.on('open', () => {
      this.log(config.id, 'Connected, sending start message');
      ws.send(config.startMessage);
    });

    ws.on('message', (data: WebSocket.Data) => {
      const raw = data.toString();
      this.handleMessage(config.id, raw).catch((err) => {
        this.logError(config.id, `Error handling message: ${err.message}`);
      });
    });

    ws.on('close', () => {
      this.logWarn(config.id, 'Connection closed');
      this.scheduleReconnect(config);
    });

    ws.on('error', (err: Error) => {
      this.logError(config.id, `WebSocket error: ${err.message}`);
    });
  }

  private async handleMessage(kartodromId: string, raw: string) {
    const msg = this.parser.parseMessage(kartodromId, raw);
    if (!msg) return;

    const isFirst = this.isFirstMessage.get(kartodromId) ?? true;
    if (isFirst) {
      this.isFirstMessage.set(kartodromId, false);
    }

    const passAt = isFirst ? null : new Date();

    await this.timingService.insertRawMessage(kartodromId, msg);

    const parsedHeat = this.parser.parseHeat(msg);
    const heat = await this.timingService.upsertHeat({
      kartodromId,
      ...parsedHeat,
      passAt,
    });

    const newLaps = this.parser.detectNewLaps(kartodromId, msg, isFirst);
    for (const lap of newLaps) {
      const inserted = await this.timingService.insertLap({
        heat,
        ...lap,
        passAt,
      });
      if (inserted) {
        this.log(kartodromId, `New lap: ${lap.driverName} (kart ${lap.kart}) lap #${lap.lapCount} - ${lap.time}ms`);
      }
    }
  }

  private scheduleReconnect(config: KartodromConfig) {
    if (!this.shouldReconnect) return;
    this.log(config.id, 'Reconnecting in 1s...');
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect(config);
      }
    }, 1000);
  }

  private log(kartodromId: string, message: string) {
    this.loggers.get(kartodromId)?.log(message);
  }

  private logWarn(kartodromId: string, message: string) {
    this.loggers.get(kartodromId)?.warn(message);
  }

  private logError(kartodromId: string, message: string) {
    this.loggers.get(kartodromId)?.error(message);
  }
}
