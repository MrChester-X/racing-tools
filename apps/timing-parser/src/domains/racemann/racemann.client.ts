import { Injectable, Logger } from '@nestjs/common';
import { retry } from './live/retry';
import { RacemannRaceStartData, RacemannSessionLaps } from './racemann.types';

const REQUEST_TIMEOUT_MS = 10_000;
const SELECT_RACE_RE = /raceSite\.selectRace\(\s*['"]([0-9a-f-]{36})['"]/i;

@Injectable()
export class RacemannClient {
  private readonly logger = new Logger(RacemannClient.name);

  async getHomeLastRaceId(subdomain: string): Promise<string | null> {
    const html = await this.get(subdomain, '/home/last');
    const match = SELECT_RACE_RE.exec(html);
    return match ? match[1].toLowerCase() : null;
  }

  async getRaceStartData(subdomain: string, raceId: string): Promise<RacemannRaceStartData> {
    const body = new URLSearchParams({ raceId }).toString();
    const json = await this.post<RacemannRaceStartData>(subdomain, '/race/GetRaceStartData', body);
    if (!Array.isArray(json?.comps) || !Array.isArray(json?.sessions)) {
      throw new Error('Malformed GetRaceStartData response');
    }
    return json;
  }

  async getSessionLaps(
    subdomain: string,
    raceId: string,
    compRegNum: string,
    sessionNum: number,
  ): Promise<RacemannSessionLaps> {
    const body = new URLSearchParams({
      raceId,
      compRegNum,
      sessionNum: String(sessionNum),
    }).toString();
    const json = await this.post<RacemannSessionLaps>(subdomain, '/race/GetSessionLaps', body);
    if (!Array.isArray(json?.laps)) {
      throw new Error('Malformed GetSessionLaps response');
    }
    return json;
  }

  private post<T>(subdomain: string, path: string, body: string): Promise<T> {
    return retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(`https://${subdomain}.racemann.com${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest',
              accept: '*/*',
            },
            body,
            signal: controller.signal,
          });
          if (!res.ok) throw new HttpError(`racemann ${path} responded ${res.status}`, res.status);
          return (await res.json()) as T;
        } finally {
          clearTimeout(timer);
        }
      },
      { attempts: 3, baseDelayMs: 300, maxDelayMs: 2_000, shouldRetry: isTransient },
    );
  }

  private get(subdomain: string, path: string): Promise<string> {
    return retry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(`https://${subdomain}.racemann.com${path}`, {
            method: 'GET',
            headers: { accept: 'text/html,*/*' },
            signal: controller.signal,
          });
          if (!res.ok) throw new HttpError(`racemann ${path} responded ${res.status}`, res.status);
          return await res.text();
        } finally {
          clearTimeout(timer);
        }
      },
      { attempts: 3, baseDelayMs: 300, maxDelayMs: 2_000, shouldRetry: isTransient },
    );
  }
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isTransient(err: unknown): boolean {
  if (err instanceof HttpError) return err.status >= 500 || err.status === 408 || err.status === 429;
  return true;
}
