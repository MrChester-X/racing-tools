import { GrrTrackConfig } from '../getraceresults-live.config';

export const igoraKartingConfig: GrrTrackConfig = {
  id: 'igora-karting',
  urlName: 'igora-karting',
  remapSportKarts: true,
  // TEMPORARY: mirror laps into a clean `<name> v2` heat (see config comment).
  mirrorToV2Heat: true,
};
