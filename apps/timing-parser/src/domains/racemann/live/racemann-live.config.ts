export interface RacemannLiveConfig {
  subdomain: string;
  kartodromId: string;
  homeLastPollMs: number;
}

export const racemannLiveConfigs: RacemannLiveConfig[] = [
  {
    subdomain: 'pitstop',
    kartodromId: 'racemann-pitstop',
    homeLastPollMs: 10_000,
  },
  {
    subdomain: 'miks',
    kartodromId: 'racemann-miks',
    homeLastPollMs: 10_000,
  },
  {
    subdomain: 'miksevents',
    kartodromId: 'racemann-miksevents',
    homeLastPollMs: 10_000,
  },
];
