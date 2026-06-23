export interface GrrTrackConfig {
  id: string;
  urlName: string;
  /**
   * When true, a kart whose name reads "Sport N" is numbered 100+N instead of
   * its raw start number. At Igora the Sport karts reuse the rental karts' start
   * numbers (e.g. "Sport 1" and "Kart 1" both run #1 in the same heat), so this
   * keeps the two fleets distinct.
   */
  remapSportKarts?: boolean;
}
