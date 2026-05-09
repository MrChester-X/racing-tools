export interface RacemannLiveConfig {
  subdomain: string;
  kartodromId: string;
  homeLastPollMs: number;
}

export const racemannLiveConfig: RacemannLiveConfig = {
  subdomain: 'pitstop',
  kartodromId: 'racemann-pitstop',
  homeLastPollMs: 10_000,
};
