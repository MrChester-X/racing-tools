export interface SmtTimingDriver {
  LP: number;
  A: number; // avg time
  B: number; // best time
  K: string; // kart number
  G: string; // gap
  D: number; // driver external id
  L: number; // lap count
  T: number; // last lap time (ms)
  R: number; // unknown
  N: string; // driver name
  P: number; // position
  M: number; // unknown
}

export interface SmtTimingMessage {
  T: number; // scheduled timestamp (unix seconds)
  CE: number; // clock enabled (0/1)
  CS: number; // clock started (0/1)
  D: SmtTimingDriver[];
  EM: number; // unknown
  C: number; // race elapsed time (ms)
  N: string; // heat name
  E: number; // heat type (1=time, 2=laps)
  R: number; // unknown
  L: number; // total laps (for laps-type race)
  S: number; // status (1=inProgress, 4=finished)
}
