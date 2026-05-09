export interface HeatMeta {
  rawStatus?: number;
  raceTime?: number;
  type?: string;
  totalLaps?: number;
}

export interface LapMeta {
  avgTime?: number;
  bestTime?: number;
  gap?: string;
}

export interface HeatItem {
  id: string;
  kartodromId: string;
  scheduledTimestamp: number;
  name: string;
  status: 'waiting' | 'inProgress' | 'finished' | 'unknown';
  meta: HeatMeta;
  createdAt: string;
  passAt: string | null;
}

export interface LapItem {
  id: string;
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  driverExternalId: number;
  meta: LapMeta;
  createdAt: string;
  passAt: string | null;
}

export interface HeatDetail extends HeatItem {
  laps: LapItem[];
}
