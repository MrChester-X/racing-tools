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
  /**
   * TEMPORARY: also write every lap into a parallel heat named `<name> v2`.
   * Other devices pollute the primary heat with false laps; the v2 heat is only
   * ever written by us, so it stays clean. Remove once the duplicate-source
   * problem is fixed upstream.
   */
  mirrorToV2Heat?: boolean;
}
