import { Injectable, Logger } from '@nestjs/common';
import { HeatStatus } from '@racing/shared';
import { decompressFromUTF16 } from 'lz-string';
import {
  GrrAppInfo,
  GrrColumn,
  GrrHeatInfo,
  GrrLap,
  GrrResultsChange,
  GrrResultsInit,
  SignalRFrame,
} from './getraceresults.types';

const MAX_INT64 = '9223372036854775807';
const US_PER_MS = 1_000;
const LAPS_MARKER_RE = /--\s*(\d+)\s*laps?\s*--/i;

interface KartState {
  driverName: string;
  klass: string;
  position: number;
  gap: string;
  lapCount: number;
  lastTimeRaw: string;
  bestTimeRaw: string;
  fastestRoundNumber: number;
  initialized: boolean;
}

interface PendingLap {
  startNumber: string;
  rowIndex: number;
  timeMs: number;
  prevGap: string;
  isInitial: boolean;
  isPit: boolean;
  isOut: boolean;
}

// Color/state codes in the 4th element of lastRoundTime cell updates.
// See renderCell switch in the original LiveTiming client.
const LAST_TIME_COLOR_PIT = '-2'; // "P <time>"  — in-lap (pit entry lap)
const LAST_TIME_COLOR_OUT = '-3'; // "O <time>"  — out-lap (after pit)

export interface ParsedHeatInfo {
  name: string;
  status: HeatStatus;
  scheduledTimestamp: number;
  meta: Record<string, any>;
}

export interface ParsedDispatch {
  heatInfo?: ParsedHeatInfo;
  laps: GrrLap[];
}

@Injectable()
export class GrrLiveParser {
  private readonly logger = new Logger(GrrLiveParser.name);
  private columnIndex = new Map<string, number>();
  private columnIndexLower = new Map<string, number>();
  private rowToKart = new Map<number, string>();
  private karts = new Map<string, KartState>();
  private heatName: string | null = null;
  private heatInfo: GrrHeatInfo | null = null;
  private appInfo: GrrAppInfo = {};

  reset(reason: string): void {
    if (this.heatName) {
      this.logger.log(`Resetting parser state: ${reason}`);
    }
    this.columnIndex.clear();
    this.columnIndexLower.clear();
    this.rowToKart.clear();
    this.karts.clear();
    this.heatName = null;
    this.heatInfo = null;
    this.appInfo = {};
  }

  processFrame(frame: SignalRFrame): ParsedDispatch {
    const out: ParsedDispatch = { laps: [] };
    const messages = Array.isArray(frame?.M) ? frame.M : [];
    let heatTouched = false;

    for (const m of messages) {
      if (!Array.isArray(m) || m.length < 1) continue;
      const method = m[0] as string;
      const payload = m[1];

      if (method === '_') {
        const expanded = this.expandCompressed(payload);
        for (const inner of expanded) {
          if (this.dispatch(inner[0], inner[1], out.laps)) heatTouched = true;
        }
      } else if (this.dispatch(method, payload, out.laps)) {
        heatTouched = true;
      }
    }

    if (heatTouched) {
      const info = this.buildHeatInfo();
      if (info) out.heatInfo = info;
    }

    return out;
  }

  private dispatch(method: string, payload: any, laps: GrrLap[]): boolean {
    if (method === 'a_i') {
      const next = (payload || {}) as GrrAppInfo;
      this.maybeSwitchHeat(next.h ?? null, 'a_i');
      this.appInfo = next;
      return true;
    }
    if (method === 'a_u') {
      const next = (payload || {}) as GrrAppInfo;
      if (next.h) this.maybeSwitchHeat(next.h, 'a_u');
      this.appInfo = { ...this.appInfo, ...next };
      return true;
    }
    if (method === 'h_i') {
      const info = (payload || {}) as GrrHeatInfo;
      this.maybeSwitchHeat(info.n ?? null, 'h_i');
      this.heatInfo = info;
      return true;
    }
    if (method === 'h_u') {
      const info = (payload || {}) as GrrHeatInfo;
      if (info?.n) this.maybeSwitchHeat(info.n, 'h_u');
      this.heatInfo = this.heatInfo ? { ...this.heatInfo, ...info } : info;
      return true;
    }
    if (method === 'h_h') {
      if (payload && typeof payload === 'object') {
        this.heatInfo = this.heatInfo
          ? { ...this.heatInfo, ...(payload as GrrHeatInfo) }
          : (payload as GrrHeatInfo);
      }
      return false;
    }
    if (method === 'r_i') {
      this.handleResultsInit(payload as GrrResultsInit, laps);
      return false;
    }
    if (method === 'r_c') {
      this.applyCellUpdates(payload as GrrResultsChange, laps);
      return false;
    }
    return false;
  }

  private maybeSwitchHeat(nextName: string | null, source: string): void {
    if (!nextName || nextName === this.heatName) return;
    this.reset(`heat switch via ${source}: "${nextName}"`);
    this.heatName = nextName;
  }

  private expandCompressed(payload: any): Array<[string, any]> {
    if (typeof payload !== 'string') return [];
    let z = payload;
    const dd = z.lastIndexOf('::');
    if (dd !== -1) z = z.substring(0, dd);
    let json: string | null;
    try {
      json = decompressFromUTF16(z);
    } catch (err) {
      this.logger.warn(`LZString decompress failed: ${(err as Error).message}`);
      return [];
    }
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed as Array<[string, any]>;
    } catch (err) {
      this.logger.warn(`Decompressed payload is not JSON: ${(err as Error).message}`);
      return [];
    }
  }

  private handleResultsInit(init: GrrResultsInit, laps: GrrLap[]): void {
    if (!init?.l?.h) return;
    this.columnIndex.clear();
    this.columnIndexLower.clear();
    init.l.h.forEach((col: GrrColumn, idx: number) => {
      this.columnIndex.set(col.n, idx);
      this.columnIndexLower.set(col.n.toLowerCase(), idx);
    });
    this.rowToKart.clear();
    this.karts.clear();
    if (Array.isArray(init.r)) {
      this.applyCellUpdates(init.r as GrrResultsChange, laps);
    }
  }

  private applyCellUpdates(updates: GrrResultsChange, laps: GrrLap[]): void {
    if (!Array.isArray(updates)) return;

    const posIdx = this.findColIdx('position');
    const nameIdx = this.findColIdx('name', 'currentDriver');
    const numIdx = this.findColIdx('startnumber');
    const classIdx = this.findColIdx('class');
    const gapIdx = this.findColIdx('hole');
    const lastIdx = this.findColIdx('lastRoundTime');
    const bestIdx = this.findColIdx('fastestRoundTime');
    const bestRoundIdx = this.findColIdx('fastestRoundNumber');
    const teamIdx = this.findColIdx('team name', 'teamName', 'team');

    // Pass 1: resolve row → kart identity so further cells route correctly.
    for (const upd of updates) {
      if (!Array.isArray(upd) || upd.length < 3) continue;
      const [row, col, value] = upd;
      if (typeof row !== 'number' || row < 0) continue;
      if (col !== numIdx) continue;
      const sn = stringValue(value);
      if (!sn) continue;
      this.rowToKart.set(row, sn);
      if (!this.karts.has(sn)) {
        this.karts.set(sn, blankKart());
      }
    }

    // Pass 2: apply non-lap cells and collect pending lap events.
    const pending: PendingLap[] = [];
    for (const upd of updates) {
      if (!Array.isArray(upd) || upd.length < 3) continue;
      const [row, col, value] = upd;
      if (typeof row !== 'number' || typeof col !== 'number') continue;
      if (row < 0 || col < 0) continue;
      if (col === numIdx) continue;

      const sn = this.rowToKart.get(row);
      if (!sn) continue;
      let kart = this.karts.get(sn);
      if (!kart) {
        kart = blankKart();
        this.karts.set(sn, kart);
      }

      if (col === posIdx) {
        kart.position = parseIntSafe(value);
      } else if (col === teamIdx) {
        const team = stringValue(value);
        if (team) kart.driverName = team;
      } else if (col === nameIdx) {
        const name = stringValue(value);
        if (name && !kart.driverName) kart.driverName = name;
      } else if (col === classIdx) {
        kart.klass = stringValue(value);
      } else if (col === gapIdx) {
        kart.gap = stringValue(value);
      } else if (col === bestIdx) {
        kart.bestTimeRaw = stringValue(value);
      } else if (col === bestRoundIdx) {
        kart.fastestRoundNumber = parseIntSafe(value);
      } else if (col === lastIdx) {
        const raw = stringValue(value);
        if (!raw || raw === MAX_INT64) continue;
        const isFirst = !kart.initialized;
        if (!isFirst && raw === kart.lastTimeRaw) continue;
        const prevGap = kart.gap;
        kart.lastTimeRaw = raw;
        kart.initialized = true;
        const parsed = parseLastRoundTime(raw);
        if (!parsed || parsed.timeMs <= 0) continue;
        const colorCode = upd.length > 3 ? stringValue(upd[3]) : '';
        pending.push({
          startNumber: sn,
          rowIndex: row,
          timeMs: parsed.timeMs,
          prevGap,
          isInitial: isFirst,
          isPit: parsed.isPit || colorCode === LAST_TIME_COLOR_PIT,
          isOut: parsed.isOut || colorCode === LAST_TIME_COLOR_OUT,
        });
      }
    }

    if (pending.length === 0) return;

    // Pass 3: determine lap count for each pending lap using GAP semantics.
    // `-- N laps --` in a kart's gap column means N completed laps; the lap
    // that just finished (the one whose time arrived in lastRoundTime) is N.
    // For karts without a marker, inherit the lap count from the closest
    // better-positioned kart that does have one — every marker boundary in
    // position order represents one full lap behind.
    const lapByKart = this.computeLapByKart();
    for (const p of pending) {
      const kart = this.karts.get(p.startNumber);
      if (!kart) continue;
      const knownLap =
        lapByKart.get(p.startNumber) ?? parseLapsMarker(p.prevGap) ?? null;
      let lapCountMode: 'race' | 'session';
      if (knownLap != null && knownLap > 0) {
        kart.lapCount = knownLap;
        lapCountMode = 'race';
      } else {
        kart.lapCount += 1;
        lapCountMode = 'session';
      }
      laps.push({
        rowIndex: p.rowIndex,
        startNumber: p.startNumber,
        driverName: kart.driverName || p.startNumber,
        kart: p.startNumber,
        position: kart.position || p.rowIndex + 1,
        lapCount: kart.lapCount,
        timeMs: p.timeMs,
        isInitial: p.isInitial,
        lapCountMode,
        meta: {
          klass: kart.klass || null,
          bestTimeMs:
            kart.bestTimeRaw && kart.bestTimeRaw !== MAX_INT64
              ? usToMs(kart.bestTimeRaw)
              : null,
          fastestRoundNumber: kart.fastestRoundNumber || null,
          gap: kart.gap || null,
          isPit: p.isPit || undefined,
          isOut: p.isOut || undefined,
        },
      });
    }
  }

  private findColIdx(...names: string[]): number | undefined {
    for (const name of names) {
      const direct = this.columnIndex.get(name);
      if (direct !== undefined) return direct;
      const lower = this.columnIndexLower.get(name.toLowerCase());
      if (lower !== undefined) return lower;
    }
    return undefined;
  }

  private computeLapByKart(): Map<string, number> {
    const ordered = Array.from(this.karts.entries())
      .filter(([, k]) => k.position > 0)
      .sort(([, a], [, b]) => a.position - b.position);
    const result = new Map<string, number>();
    let lastMarker: number | null = null;
    for (const [sn, k] of ordered) {
      const marker = parseLapsMarker(k.gap);
      if (marker != null && marker > 0) lastMarker = marker;
      if (lastMarker != null) result.set(sn, lastMarker);
    }
    return result;
  }

  private buildHeatInfo(): ParsedHeatInfo | null {
    const name = this.heatName || this.heatInfo?.n;
    if (!name) return null;
    const startTicks = this.heatInfo?.s;
    if (!startTicks || startTicks <= 0) return null;
    const scheduledTimestamp = Math.floor(startTicks / 10_000_000);
    return {
      name,
      scheduledTimestamp,
      status: this.resolveStatus(),
      meta: {
        flag: this.heatInfo?.f ?? null,
        elapsedMs: typeof this.heatInfo?.c === 'number' ? this.heatInfo.c : null,
        remainingTicks: typeof this.heatInfo?.r === 'number' ? this.heatInfo.r : null,
        lapLimit: typeof this.heatInfo?.ll === 'number' ? this.heatInfo.ll : null,
        timeLimitTicks: typeof this.heatInfo?.lt === 'number' ? this.heatInfo.lt : null,
        appFlag: this.appInfo?.f ?? null,
        appState: this.appInfo?.s ?? null,
      },
    };
  }

  private resolveStatus(): HeatStatus {
    if (this.heatInfo?.h === true) return HeatStatus.FINISHED;
    const elapsed = typeof this.heatInfo?.c === 'number' ? this.heatInfo.c : 0;
    if (elapsed > 0) return HeatStatus.IN_PROGRESS;
    if (this.heatInfo?.f && this.heatInfo.f > 0) return HeatStatus.IN_PROGRESS;
    return HeatStatus.WAITING;
  }
}

function blankKart(): KartState {
  return {
    driverName: '',
    klass: '',
    position: 0,
    gap: '',
    lapCount: 0,
    lastTimeRaw: '',
    bestTimeRaw: '',
    fastestRoundNumber: 0,
    initialized: false,
  };
}

function parseLapsMarker(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = LAPS_MARKER_RE.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse a lastRoundTime cell value. The server sends one of two shapes:
 *   1. Pure microseconds as a numeric string (e.g. "208580000") — raw timing
 *      data, common in r_c (change) updates.
 *   2. A pre-formatted display string (e.g. "P 3:28.580", "3:28.580",
 *      "1:07.425", "67.425") — sometimes appears in r_i (init) snapshots and
 *      certain other paths. The "P "/"O " prefix marks in-lap / out-lap.
 */
function parseLastRoundTime(
  raw: string,
): { timeMs: number; isPit: boolean; isOut: boolean } | null {
  let s = raw.trim();
  if (!s) return null;

  let isPit = false;
  let isOut = false;
  // Strip optional state prefix ("P 3:28.580" → "3:28.580").
  const prefixMatch = /^([POpo])\s+(.+)$/.exec(s);
  if (prefixMatch) {
    const letter = prefixMatch[1].toUpperCase();
    if (letter === 'P') isPit = true;
    else if (letter === 'O') isOut = true;
    s = prefixMatch[2].trim();
  }

  // Pure integer → microseconds.
  if (/^\d+$/.test(s)) {
    return { timeMs: usToMs(s), isPit, isOut };
  }

  // Otherwise a colon-separated time string: H:MM:SS.mmm | MM:SS.mmm | SS.mmm.
  const parts = s.split(':');
  let totalSec = 0;
  for (const part of parts) {
    const n = parseFloat(part);
    if (!Number.isFinite(n)) return null;
    totalSec = totalSec * 60 + n;
  }
  if (totalSec <= 0) return null;
  return { timeMs: Math.round(totalSec * 1000), isPit, isOut };
}

function usToMs(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / US_PER_MS);
}

function parseIntSafe(value: any): number {
  const n = parseInt(stringValue(value), 10);
  return Number.isFinite(n) ? n : 0;
}

function stringValue(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value);
}
