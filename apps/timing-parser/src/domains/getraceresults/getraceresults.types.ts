export interface SignalRFrame {
  C?: string;
  S?: number;
  G?: string;
  M?: Array<[string, any]>;
}

export interface GrrColumn {
  n: string;
  c: string;
}

export interface GrrResultsInit {
  l: {
    ck: number;
    h: GrrColumn[];
  };
  r: Array<[number, number, string, string?]>;
}

export interface GrrHeatInfo {
  n: string;
  lm?: number;
  s?: number;
  e?: number;
  lr?: number;
  lt?: number;
  lg?: number;
  ll?: number;
  lu?: number;
  f?: number;
  m?: number;
  c?: number;
  h?: boolean;
  r?: number;
  q?: number;
  t?: string | null;
}

export interface GrrAppInfo {
  h?: string;
  /** Green-flag (heat start) time in ticks, as a numeric string (== GrrHeatInfo.s). */
  g?: string;
  f?: string;
  s?: string;
  o?: string;
  [k: string]: string | undefined;
}

export type GrrResultsChange = Array<[number, number, string | number | null, string?] | [number, number, number, null]>;

export type GrrLapCountMode = 'race' | 'session';

export interface GrrLap {
  rowIndex: number;
  startNumber: string;
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  timeMs: number;
  isInitial: boolean;
  lapCountMode: GrrLapCountMode;
  meta: Record<string, any>;
}
