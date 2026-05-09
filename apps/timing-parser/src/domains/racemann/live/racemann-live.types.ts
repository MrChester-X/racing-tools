export interface NewLap {
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  driverExternalId: number;
  meta: Record<string, any>;
}
