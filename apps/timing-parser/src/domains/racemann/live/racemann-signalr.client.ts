import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { retry } from './retry';

const HUB_NAME = 'racehub';
const CONNECTION_DATA = JSON.stringify([{ name: HUB_NAME }]);
const CLIENT_PROTOCOL = '1.5';
const REQUEST_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 15_000;
const PONG_TIMEOUT_MS = 10_000;

interface NegotiateResponse {
  ConnectionToken: string;
  ConnectionId: string;
  KeepAliveTimeout: number;
  DisconnectTimeout: number;
  TryWebSockets: boolean;
}

export interface SignalRFrame {
  raw: string;
  parsed: any;
}

export interface SignalRHandlers {
  onMessage: (frame: SignalRFrame) => void | Promise<void>;
  onClose: (reason: string) => void;
}

export class RacemannSignalRClient {
  private readonly logger: Logger;
  private ws: WebSocket | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private connectTimeout: NodeJS.Timeout | null = null;
  private disconnectTimeoutMs = 30_000;
  private lastFrameAt = 0;
  private started = false;
  private closed = false;
  private handlers: SignalRHandlers | null = null;

  constructor(private readonly subdomain: string, logger?: Logger) {
    this.logger = logger ?? new Logger(`SignalR(${subdomain})`);
  }

  async connect(raceId: string, handlers: SignalRHandlers): Promise<void> {
    this.handlers = handlers;
    const negotiate = await this.negotiate();
    this.disconnectTimeoutMs = Math.floor((negotiate.DisconnectTimeout ?? 30) * 1000);

    if (!negotiate.TryWebSockets) {
      throw new Error('Racemann SignalR: server does not support websockets');
    }

    const wsUrl = this.buildConnectUrl(negotiate.ConnectionToken);
    this.logger.log(`Connecting WS for race=${raceId}`);
    this.ws = new WebSocket(wsUrl, { handshakeTimeout: REQUEST_TIMEOUT_MS });

    await new Promise<void>((resolve, reject) => {
      const ws = this.ws!;
      this.connectTimeout = setTimeout(() => {
        reject(new Error('ws open timeout'));
      }, REQUEST_TIMEOUT_MS);
      const cleanup = () => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
      };
      const onOpenError = (err: Error) => {
        cleanup();
        reject(err);
      };
      ws.once('error', onOpenError);
      ws.once('open', () => {
        cleanup();
        ws.off('error', onOpenError);
        resolve();
      });
    });

    this.lastFrameAt = Date.now();
    this.armWatchdog();
    this.armHeartbeat();

    this.ws!.on('message', (data: WebSocket.RawData) => {
      this.handleFrame(data.toString(), negotiate.ConnectionToken, raceId).catch((err) => {
        this.logger.error(`Frame handling failed: ${(err as Error).message}`);
      });
    });

    this.ws!.on('pong', () => {
      this.lastFrameAt = Date.now();
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    });

    this.ws!.on('close', (code, reasonBuf) => {
      const reason = `ws close code=${code} reason=${reasonBuf?.toString() || 'n/a'}`;
      this.shutdown(reason);
    });

    this.ws!.on('error', (err: Error) => {
      this.logger.warn(`WS error: ${err.message}`);
      this.shutdown(`ws error: ${err.message}`);
    });
  }

  close(): void {
    this.shutdown('client close');
  }

  private shutdown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          // terminate is forceful and immediate; close() can hang on a half-open socket.
          this.ws.terminate();
        }
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.handlers?.onClose(reason);
  }

  private armWatchdog(): void {
    this.watchdog = setInterval(() => {
      const idleMs = Date.now() - this.lastFrameAt;
      if (idleMs > this.disconnectTimeoutMs) {
        this.logger.warn(`Watchdog: no frame for ${idleMs}ms, forcing reconnect`);
        this.shutdown('watchdog timeout');
      }
    }, Math.max(1_000, Math.floor(this.disconnectTimeoutMs / 3)));
  }

  private armHeartbeat(): void {
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.ping();
      } catch (err) {
        this.logger.warn(`ws.ping failed: ${(err as Error).message}`);
        this.shutdown('ping failed');
        return;
      }
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.logger.warn(`No pong within ${PONG_TIMEOUT_MS}ms, forcing reconnect`);
        this.shutdown('pong timeout');
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private async handleFrame(raw: string, connectionToken: string, raceId: string): Promise<void> {
    this.lastFrameAt = Date.now();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Non-JSON frame: ${raw.substring(0, 80)}`);
      return;
    }

    if (parsed?.S === 1 && !this.started) {
      this.started = true;
      try {
        await this.start(connectionToken);
        this.subscribe(raceId);
      } catch (err) {
        this.logger.error(`Start/subscribe failed: ${(err as Error).message}`);
        this.shutdown('start failed');
      }
      return;
    }

    await this.handlers?.onMessage({ raw, parsed });
  }

  private subscribe(raceId: string): void {
    const payload = JSON.stringify({
      H: HUB_NAME,
      M: 'SubscribeRace',
      A: [raceId],
      I: 0,
    });
    this.ws?.send(payload);
    this.logger.log(`SubscribeRace sent for ${raceId}`);
  }

  private async negotiate(): Promise<NegotiateResponse> {
    const url =
      `https://${this.subdomain}.racemann.com/signalr/negotiate` +
      `?clientProtocol=${CLIENT_PROTOCOL}` +
      `&connectionData=${encodeURIComponent(CONNECTION_DATA)}` +
      `&_=${Date.now()}`;
    const json = await this.httpJson<NegotiateResponse>(url);
    if (!json.ConnectionToken) {
      throw new Error('Racemann SignalR: negotiate returned no ConnectionToken');
    }
    return json;
  }

  private async start(connectionToken: string): Promise<void> {
    const url =
      `https://${this.subdomain}.racemann.com/signalr/start` +
      `?transport=webSockets` +
      `&clientProtocol=${CLIENT_PROTOCOL}` +
      `&connectionToken=${encodeURIComponent(connectionToken)}` +
      `&connectionData=${encodeURIComponent(CONNECTION_DATA)}` +
      `&_=${Date.now()}`;
    const json = await this.httpJson<{ Response: string }>(url);
    if (json.Response !== 'started') {
      throw new Error(`Racemann SignalR: start returned ${JSON.stringify(json)}`);
    }
  }

  private buildConnectUrl(connectionToken: string): string {
    const tid = Math.floor(Math.random() * 10);
    return (
      `wss://${this.subdomain}.racemann.com/signalr/connect` +
      `?transport=webSockets` +
      `&clientProtocol=${CLIENT_PROTOCOL}` +
      `&connectionToken=${encodeURIComponent(connectionToken)}` +
      `&connectionData=${encodeURIComponent(CONNECTION_DATA)}` +
      `&tid=${tid}`
    );
  }

  private httpJson<T>(url: string): Promise<T> {
    return retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: { accept: 'application/json,*/*' },
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(`${url} responded ${res.status}`);
          }
          return (await res.json()) as T;
        } finally {
          clearTimeout(timer);
        }
      },
      { attempts: 3, baseDelayMs: 300, maxDelayMs: 2_000 },
    );
  }
}
