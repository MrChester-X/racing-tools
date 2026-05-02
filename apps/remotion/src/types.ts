export interface LapData {
  count: number;         // lap index (0-based)
  time: number;          // lap time in seconds
  absoluteStartTime: number; // seconds from video start
  absoluteEndTime: number;   // seconds from video start
  isBestSoFar: boolean;  // is this the best lap up to this point
}

/** A completed lap from any driver in the race, for "best so far" tracking. */
export interface RaceLapEvent {
  driverName: string;
  kart: string;
  time: number;
  /** When this lap ended, in seconds from race start (no offset applied) */
  absoluteEndTime: number;
}

export interface RaceOverlayProps {
  laps: LapData[];
  totalLaps: number;
  offsetSeconds: number;
  driverName: string;
  driverPosition: number;
  totalDrivers: number;
  /** All laps from all drivers, sorted by absoluteEndTime — for "best so far" */
  raceLapEvents?: RaceLapEvent[];
}

export interface RaceOverlayWithVideoProps extends RaceOverlayProps {
  sourceVideoUrl: string;
}
