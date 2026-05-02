export interface LapData {
  count: number;
  time: number;
  absoluteStartTime: number;
  absoluteEndTime: number;
  isBestSoFar: boolean;
}

export interface RaceLapEvent {
  driverName: string;
  kart: string;
  time: number;
  absoluteEndTime: number;
}
