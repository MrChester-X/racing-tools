export interface DriverLapData {
  count: number;
  time: number;
  stintText?: string;
}

export interface DriverData {
  index: number;
  name: string;
  startKart: string;
  karts: string[];
  laps: DriverLapData[];
}

export interface RaceData {
  raceName?: string;
  pitlane?: string[];
  drivers: DriverData[];
}

export interface VideoJobUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photo: string | null;
}

export interface VideoJob {
  id: string;
  raceUrl: string;
  raceName?: string;
  driverName: string;
  offset: number;
  sourceVideoS3Key: string;
  resultVideoS3Key?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
  raceData?: RaceData;
  videoDurationSec?: number;
  renderDurationMs?: number;
  uploadDurationMs?: number;
  archivedAt?: string | null;
  downloadUrl?: string;
  sourceDownloadUrl?: string;
  user?: VideoJobUser | null;
  createdAt: string;
  updatedAt: string;
}
