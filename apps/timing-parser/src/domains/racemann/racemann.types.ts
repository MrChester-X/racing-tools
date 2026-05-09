export interface RacemannCurrentSession {
  bl: number;
  bs1: number;
  bs2: number;
  bs3: number;
  bln: number;
  al: number;
  al3: number;
  ll: number;
  n: number;
  ss: number;
  se: number;
  ssp: number;
  sep: number;
  sip: number;
  ssl: number;
  sll: number;
  ic: boolean;
  rn: string;
  t: number;
  drv: string | null;
  Car: string | null;
}

export interface RacemannComp {
  rn: string;
  fn: string;
  nn: string;
  lc: number;
  ll: number;
  ls: number;
  pos: number;
  pt: number;
  pc: number;
  pd: { Laps: number; Time: number };
  ld: { Laps: number; Time: number };
  cs: RacemannCurrentSession;
  S1: number;
  S2: number;
  S3: number;
  msg: string;
  vlc: number;
  vpt: number;
  drv_ex_id: number | null;
}

export interface RacemannStint {
  rn: string;
  n: number;
  drv: string;
  ssl: number;
  sll: number;
  ss: number;
  se: number;
  t: number;
}

export interface RacemannAdminRaceState {
  isCurrent: boolean;
  canStart: boolean;
  canStop: boolean;
  canReset: boolean;
}

export interface RacemannRaceData {
  Id: number;
  Name: string;
  FlagStatus: string;
  IsComplete: boolean;
  LapsComplete: number;
  ScheduledTime: number;
  ScheduledLaps: number;
  RaceTime: number;
  TimeOfDay: string;
  TimeToGo: number;
}

export interface RacemannRaceSettings {
  Id: string;
  RaceName: string;
  Start: string | null;
  End: string | null;
  TrackId: string | null;
  ScheduledLaps: number;
  IsTimeAttackMode: boolean;
}

export interface RacemannRaceStartData {
  comps: RacemannComp[];
  sessions: RacemannStint[];
  lastLaps: RacemannLastLap[];
  lapsComplete: number;
  scheduledLaps: number;
  adminRaceState: RacemannAdminRaceState;
  raceData: RacemannRaceData;
  raceSettings: RacemannRaceSettings;
}

export interface RacemannLastLap {
  rn: string;
  n: number;
  ls: number;
  lt: number;
  p: number;
  rt: number;
  fd: number;
  pd: { Laps: number; Time: number };
  S1: number;
  S2: number;
  S3: number;
}

export interface RacemannLap {
  n: number;
  lt: number;
  p: number;
  rt: number;
  pd: { Laps: number; Time: number };
  S1: number;
  S2: number;
  S3: number;
}

export interface RacemannSessionLaps {
  laps: RacemannLap[];
}
