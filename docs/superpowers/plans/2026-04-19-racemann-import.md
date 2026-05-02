# Racemann Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /racemann/import` endpoint in `timing-parser` that imports a completed or in-progress race from `*.racemann.com` into `heats` / `laps`; drive it from a modal on the `/heats` page in `race-time-front`.

**Architecture:** New `racemann` domain in `timing-parser` (controller → service → client → mapper → existing `TimingService`). Synchronous import: fetch all `GetSessionLaps` pairs in chunks of 10 with 10s per-request timeout, map → upsert Heat → insert Laps (idempotent per lap via existing `orIgnore`). Frontend modal POSTs URL + name, then redirects to the created heat.

**Tech Stack:** NestJS 11, TypeORM, native `fetch` (Node 18+), `class-validator` / `class-transformer` for DTO, Next.js 15 + axios on the front, `@supabase/supabase-js` Realtime (already wired on `/heats/[id]`).

**Spec:** `docs/superpowers/specs/2026-04-19-racemann-import-design.md`

**Testing note:** `timing-parser` has no test framework installed. This plan does NOT add one — verification is compile checks (`npx tsc --noEmit`) plus manual HTTP smoke tests with `curl`. If tests are wanted later, start by copying jest config from `telegram-race-timer`.

---

## File Structure

New files in `timing-parser`:

- `src/domains/racemann/racemann.types.ts` — TypeScript interfaces for racemann API shapes.
- `src/domains/racemann/racemann.client.ts` — HTTP client (one call per racemann endpoint).
- `src/domains/racemann/racemann.mapper.ts` — pure functions: URL parse, Heat builder, Lap builder.
- `src/domains/racemann/racemann.service.ts` — orchestrator: URL → fetch → map → persist.
- `src/domains/racemann/racemann.controller.ts` — `POST /racemann/import`.
- `src/domains/racemann/racemann.module.ts` — Nest module.
- `src/domains/racemann/dto/import-race.dto.ts` — request DTO.

Modified in `timing-parser`:

- `src/domains/domains.module.ts` — import `RacemannModule`.
- `src/main.ts` — `enableCors()` + global `ValidationPipe`.
- `package.json` — add `class-validator`, `class-transformer`.

New in `race-time-front`:

- `src/app/heats/components/ImportRaceModal.tsx` — modal form + submit.

Modified in `race-time-front`:

- `src/app/heats/components/HeatsList.tsx` — "Import race" button wired to modal.

User action (out of plan scope, documented here):

- `race-time-front/.env.local` — add `NEXT_PUBLIC_PARSER_URL=http://localhost:3001`.

---

## Task 1: Install validator deps and bootstrap CORS + ValidationPipe

**Files:**
- Modify: `timing-parser/package.json`
- Modify: `timing-parser/src/main.ts`

- [ ] **Step 1: Add runtime deps**

Run in `timing-parser/`:
```
npm install class-validator class-transformer
```
Expected: `added X packages`. `package.json` `dependencies` now includes both.

- [ ] **Step 2: Enable CORS and global ValidationPipe**

Replace `src/main.ts` contents:

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(process.env.PORT || 3001);
  Logger.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
```

- [ ] **Step 3: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```
git add timing-parser/package.json timing-parser/package-lock.json timing-parser/src/main.ts
git commit -m "feat(timing-parser): enable CORS + global ValidationPipe"
```

---

## Task 2: Racemann API types

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.types.ts`

- [ ] **Step 1: Write the types file**

Create `timing-parser/src/domains/racemann/racemann.types.ts`:

```typescript
export interface RacemannComp {
  rn: string;
  fn: string;
  lc: number;
  pos: number;
  cs: unknown;
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

export interface RacemannRaceStartData {
  comps: RacemannComp[];
  sessions: RacemannStint[];
  lapsComplete: number;
  scheduledLaps: number;
  adminRaceState: RacemannAdminRaceState;
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
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/racemann.types.ts
git commit -m "feat(racemann): response types"
```

---

## Task 3: Racemann HTTP client

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.client.ts`

- [ ] **Step 1: Write the client**

Create `timing-parser/src/domains/racemann/racemann.client.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RacemannRaceStartData, RacemannSessionLaps } from './racemann.types';

const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class RacemannClient {
  private readonly logger = new Logger(RacemannClient.name);

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

  private async post<T>(subdomain: string, path: string, body: string): Promise<T> {
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
      if (!res.ok) {
        throw new Error(`racemann ${path} responded ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/racemann.client.ts
git commit -m "feat(racemann): HTTP client with AbortController timeout"
```

---

## Task 4: Mapper — URL parsing + Heat and Lap builders

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.mapper.ts`

- [ ] **Step 1: Write the mapper**

Create `timing-parser/src/domains/racemann/racemann.mapper.ts`:

```typescript
import { HeatStatus } from '@racing/shared';
import {
  RacemannComp,
  RacemannLap,
  RacemannRaceStartData,
  RacemannStint,
} from './racemann.types';

const URL_RE = /^https?:\/\/([a-z0-9-]+)\.racemann\.com\/Race\/id\/([0-9a-f-]{36})/i;

export interface ParsedRacemannUrl {
  subdomain: string;
  raceId: string;
}

export interface RacemannHeatInput {
  kartodromId: string;
  scheduledTimestamp: number;
  name: string;
  status: HeatStatus;
  meta: Record<string, unknown>;
  passAt: Date | null;
}

export interface RacemannLapInput {
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  driverExternalId: number;
  meta: Record<string, unknown>;
  passAt: Date | null;
}

export interface RacemannStintPair {
  compRegNum: string;
  sessionNum: number;
}

export function parseRacemannUrl(url: string): ParsedRacemannUrl | null {
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { subdomain: m[1].toLowerCase(), raceId: m[2].toLowerCase() };
}

export function buildStintPairs(data: RacemannRaceStartData): RacemannStintPair[] {
  const compsWithLaps = new Set(
    data.comps.filter((c) => c.lc > 0).map((c) => c.rn),
  );
  return data.sessions
    .filter((s) => compsWithLaps.has(s.rn))
    .map((s) => ({ compRegNum: s.rn, sessionNum: s.n }));
}

export function buildHeatInput(
  data: RacemannRaceStartData,
  ctx: { name: string; subdomain: string; raceId: string },
): RacemannHeatInput {
  const isInProgress = data.adminRaceState?.isCurrent === true;
  const now = new Date();
  return {
    kartodromId: `racemann-${ctx.subdomain}`,
    scheduledTimestamp: Math.floor(now.getTime() / 1000),
    name: ctx.name,
    status: isInProgress ? HeatStatus.IN_PROGRESS : HeatStatus.FINISHED,
    passAt: isInProgress ? null : now,
    meta: {
      racemannRaceId: ctx.raceId,
      subdomain: ctx.subdomain,
      lapsComplete: data.lapsComplete,
      scheduledLaps: data.scheduledLaps,
      totalComps: data.comps.length,
      totalSessions: data.sessions.length,
      importedAt: now.toISOString(),
    },
  };
}

export function buildLapInputs(
  data: RacemannRaceStartData,
  sessionLaps: Map<string, RacemannLap[]>,
  onMissingStint?: (compRn: string, lapNum: number) => void,
): RacemannLapInput[] {
  const compByRn = new Map<string, RacemannComp>(data.comps.map((c) => [c.rn, c]));
  const stintsByComp = new Map<string, RacemannStint[]>();
  for (const s of data.sessions) {
    const arr = stintsByComp.get(s.rn) ?? [];
    arr.push(s);
    stintsByComp.set(s.rn, arr);
  }

  const results: RacemannLapInput[] = [];

  for (const [key, laps] of sessionLaps) {
    const [compRn] = key.split(':');
    const comp = compByRn.get(compRn);
    if (!comp) continue;
    const stints = stintsByComp.get(compRn) ?? [];

    for (const lap of laps) {
      const stint = stints.find((s) => lap.n >= s.ssl && lap.n <= s.sll);
      if (!stint && onMissingStint) onMissingStint(compRn, lap.n);

      const meta: Record<string, unknown> = { raceTimeMs: lap.rt };
      if (stint) {
        meta.stint = {
          num: stint.n,
          driver: stint.drv,
          startLap: stint.ssl,
          endLap: stint.sll,
          startMs: stint.ss,
          endMs: stint.se,
        };
      }
      if (lap.pd?.Time > 0) {
        meta.pit = { laps: lap.pd.Laps, timeMs: lap.pd.Time };
      }
      if (lap.S1 > 0 || lap.S2 > 0 || lap.S3 > 0) {
        meta.sectors = { S1: lap.S1, S2: lap.S2, S3: lap.S3 };
      }

      results.push({
        driverExternalId: parseInt(comp.rn, 10),
        driverName: comp.fn,
        kart: comp.rn,
        lapCount: lap.n,
        time: lap.lt,
        position: lap.p,
        meta,
        passAt: null,
      });
    }
  }

  return results;
}
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/racemann.mapper.ts
git commit -m "feat(racemann): URL parser + Heat/Lap mappers"
```

---

## Task 5: Import DTO

**Files:**
- Create: `timing-parser/src/domains/racemann/dto/import-race.dto.ts`

- [ ] **Step 1: Write the DTO**

Create `timing-parser/src/domains/racemann/dto/import-race.dto.ts`:

```typescript
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImportRaceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  url!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/dto/import-race.dto.ts
git commit -m "feat(racemann): import DTO"
```

---

## Task 6: Racemann service (orchestration)

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.service.ts`

- [ ] **Step 1: Write the service**

Create `timing-parser/src/domains/racemann/racemann.service.ts`:

```typescript
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TimingService } from '../timing/timing.service';
import { RacemannClient } from './racemann.client';
import {
  buildHeatInput,
  buildLapInputs,
  buildStintPairs,
  parseRacemannUrl,
  RacemannStintPair,
} from './racemann.mapper';
import { RacemannLap } from './racemann.types';

const CHUNK_SIZE = 10;

export interface ImportResult {
  heatId: string;
  heatName: string;
  lapsInserted: number;
  stintsFetched: number;
  errors: Array<{ stint: string; message: string }>;
}

@Injectable()
export class RacemannService {
  private readonly logger = new Logger(RacemannService.name);

  constructor(
    private readonly client: RacemannClient,
    private readonly timing: TimingService,
  ) {}

  async importRace(url: string, name: string): Promise<ImportResult> {
    const parsed = parseRacemannUrl(url);
    if (!parsed) {
      throw new BadRequestException('Invalid racemann race URL');
    }
    const { subdomain, raceId } = parsed;
    const startedAt = Date.now();
    this.logger.log(`Import started: raceId=${raceId} subdomain=${subdomain}`);

    let startData;
    try {
      startData = await this.client.getRaceStartData(subdomain, raceId);
    } catch (err) {
      this.logger.warn(`GetRaceStartData failed: ${(err as Error).message}`);
      throw new BadGatewayException('Failed to fetch race data from racemann');
    }

    const pairs = buildStintPairs(startData);
    const sessionLaps = new Map<string, RacemannLap[]>();
    const errors: Array<{ stint: string; message: string }> = [];

    for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((p) => this.fetchPair(subdomain, raceId, p)),
      );
      results.forEach((r, idx) => {
        const key = `${chunk[idx].compRegNum}:${chunk[idx].sessionNum}`;
        if (r.status === 'fulfilled') {
          sessionLaps.set(key, r.value);
        } else {
          const message = (r.reason as Error).message;
          errors.push({ stint: key, message });
          this.logger.warn(`Stint fetch failed: ${key}: ${message}`);
        }
      });
    }

    if (pairs.length > 0 && errors.length === pairs.length) {
      throw new BadGatewayException('Failed to fetch laps from racemann');
    }

    const heatInput = buildHeatInput(startData, { name, subdomain, raceId });
    const heat = await this.timing.upsertHeat(heatInput);

    const lapInputs = buildLapInputs(startData, sessionLaps, (rn, lapNum) =>
      this.logger.warn(`No stint covers lap: rn=${rn} lap=${lapNum}`),
    );
    let lapsInserted = 0;
    for (const lap of lapInputs) {
      const ok = await this.timing.insertLap({ heat, ...lap });
      if (ok) lapsInserted++;
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `Import finished: ${ms}ms, ${lapsInserted} laps, ${sessionLaps.size} stints, ${errors.length} errors`,
    );

    return {
      heatId: heat.id,
      heatName: heat.name,
      lapsInserted,
      stintsFetched: sessionLaps.size,
      errors,
    };
  }

  private async fetchPair(
    subdomain: string,
    raceId: string,
    pair: RacemannStintPair,
  ): Promise<RacemannLap[]> {
    const res = await this.client.getSessionLaps(subdomain, raceId, pair.compRegNum, pair.sessionNum);
    return res.laps;
  }
}
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/racemann.service.ts
git commit -m "feat(racemann): import orchestration service"
```

---

## Task 7: Controller

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.controller.ts`

- [ ] **Step 1: Write the controller**

Create `timing-parser/src/domains/racemann/racemann.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ImportRaceDto } from './dto/import-race.dto';
import { ImportResult, RacemannService } from './racemann.service';

@Controller('racemann')
export class RacemannController {
  constructor(private readonly service: RacemannService) {}

  @Post('import')
  async import(@Body() dto: ImportRaceDto): Promise<ImportResult> {
    return this.service.importRace(dto.url, dto.name);
  }
}
```

- [ ] **Step 2: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add timing-parser/src/domains/racemann/racemann.controller.ts
git commit -m "feat(racemann): POST /racemann/import controller"
```

---

## Task 8: Module wiring

**Files:**
- Create: `timing-parser/src/domains/racemann/racemann.module.ts`
- Modify: `timing-parser/src/domains/domains.module.ts`

- [ ] **Step 1: Create the module**

Create `timing-parser/src/domains/racemann/racemann.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { RacemannClient } from './racemann.client';
import { RacemannController } from './racemann.controller';
import { RacemannService } from './racemann.service';

@Module({
  imports: [TimingModule],
  controllers: [RacemannController],
  providers: [RacemannClient, RacemannService],
})
export class RacemannModule {}
```

- [ ] **Step 2: Register in domains**

Replace `timing-parser/src/domains/domains.module.ts` contents:

```typescript
import { Module } from '@nestjs/common';
import { TimingModule } from './timing/timing.module';
import { SmtTimingModule } from './sms-timing/sms-timing.module';
import { RacemannModule } from './racemann/racemann.module';

@Module({
  imports: [TimingModule, SmtTimingModule, RacemannModule],
})
export class DomainsModule {}
```

Note the class name is `SmtTimingModule` (not Sms…), matching the existing file. If you see a different shape when you `Read`, preserve existing imports and only add `RacemannModule`.

- [ ] **Step 3: Verify compilation**

Run in `timing-parser/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Verify Nest boots**

Run in `timing-parser/`:
```
npm run start
```
Expected logs include:
```
[Nest] ...    LOG [RoutesResolver] RacemannController {/racemann}:
[Nest] ...    LOG [RouterExplorer] Mapped {/racemann/import, POST} route
```
Stop with Ctrl+C after confirming.

- [ ] **Step 5: Commit**

```
git add timing-parser/src/domains/racemann/racemann.module.ts timing-parser/src/domains/domains.module.ts
git commit -m "feat(racemann): wire module into DomainsModule"
```

---

## Task 9: Backend smoke test with real URL

**Files:** none (manual verification only)

- [ ] **Step 1: Start the parser**

Run in `timing-parser/`:
```
npm run start:dev
```

- [ ] **Step 2: POST a real import**

In a separate shell, using a real race URL (replace the URL if that race is archived):

```
curl -X POST http://localhost:3001/racemann/import \
  -H 'content-type: application/json' \
  -d '{"url":"https://pitstop.racemann.com/Race/id/731ea218-9efd-4b74-b0c3-62ccc7859b35","name":"Smoke test"}'
```

Expected JSON response: `{ "heatId": "<uuid>", "heatName": "Smoke test", "lapsInserted": <number>, "stintsFetched": <number>, "errors": [] }`.

- [ ] **Step 3: Verify rows in Supabase**

In Supabase SQL editor:
```sql
select id, "kartodromId", name, status, meta->>'racemannRaceId' as race_id
from heats
order by "createdAt" desc limit 1;

select count(*) from laps where "heatId" = '<heat_id_from_above>';
```
Expected: one heat with `kartodromId = 'racemann-pitstop'`, lap count matches `lapsInserted` in the response.

- [ ] **Step 4: Verify error path**

```
curl -X POST http://localhost:3001/racemann/import \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/nope","name":"Bad"}'
```
Expected: HTTP 400 with `{ "message": "Invalid racemann race URL", "error": "Bad Request", "statusCode": 400 }`.

- [ ] **Step 5: Stop the parser**

Ctrl+C the `start:dev` process.

No commit needed — verification only.

---

## Task 10: Frontend — Import modal component

**Files:**
- Create: `race-time-front/src/app/heats/components/ImportRaceModal.tsx`

- [ ] **Step 1: Write the modal**

Create `race-time-front/src/app/heats/components/ImportRaceModal.tsx`:

```tsx
'use client';
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const PARSER_URL = process.env.NEXT_PUBLIC_PARSER_URL || 'http://localhost:3001';

interface ImportResponse {
  heatId: string;
  heatName: string;
  lapsInserted: number;
  stintsFetched: number;
  errors: Array<{ stint: string; message: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportRaceModal({ open, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await axios.post<ImportResponse>(
        `${PARSER_URL}/racemann/import`,
        { url: url.trim(), name: name.trim() },
        { timeout: 60_000 },
      );
      router.push(`/heats/${data.heatId}`);
      onClose();
    } catch (err) {
      const msg =
        (axios.isAxiosError(err) && (err.response?.data?.message as string)) ||
        (err as Error).message ||
        'Import failed';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0a0a0f] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-gradient-to-b from-orange-500 to-amber-600 rounded-full" />
          <h3 className="text-white text-sm font-bold uppercase tracking-wide">Import race</h3>
        </div>

        <div className="space-y-1">
          <label className="text-gray-500 text-[10px] uppercase tracking-wider">Racemann URL</label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://pitstop.racemann.com/Race/id/…"
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-orange-500/40"
            disabled={isLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="text-gray-500 text-[10px] uppercase tracking-wider">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Endurance 5h – 2026-04-19"
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/40"
            disabled={isLoading}
          />
        </div>

        {error && <div className="text-red-400 text-xs">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs font-medium hover:text-white hover:bg-white/[0.04] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !url || !name}
            className="px-4 py-1.5 rounded-lg bg-orange-500 text-black text-xs font-bold uppercase tracking-wider hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```
git add race-time-front/src/app/heats/components/ImportRaceModal.tsx
git commit -m "feat(front): ImportRaceModal"
```

---

## Task 11: Wire "Import race" button into HeatsList

**Files:**
- Modify: `race-time-front/src/app/heats/components/HeatsList.tsx`

- [ ] **Step 1: Read current file**

`Read` `race-time-front/src/app/heats/components/HeatsList.tsx` in full before editing — the header block around the kartodrom filter is the target area.

- [ ] **Step 2: Add import + local state + button**

At the top of the file, add imports near the existing ones:
```tsx
import { useState } from 'react';
import { ImportRaceModal } from './ImportRaceModal';
```
(`useState` already coexists with `useEffect`; merge into a single import statement.)

Inside `HeatsList()`, after the destructured store and `router`, add:
```tsx
const [importOpen, setImportOpen] = useState(false);
```

In the JSX, replace the header block that currently renders `{heatsTotal} heats` and the loading spinner with a block that also includes the "Import race" button. Find the existing element:

```tsx
<div className="flex items-center gap-3">
  {isLoading && <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />}
  <span className="text-gray-600 text-xs">{heatsTotal} heats</span>
</div>
```

Replace it with:

```tsx
<div className="flex items-center gap-3">
  {isLoading && <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />}
  <span className="text-gray-600 text-xs">{heatsTotal} heats</span>
  <button
    onClick={() => setImportOpen(true)}
    className="px-3 py-1 rounded-md border border-white/10 text-gray-300 text-[11px] font-medium hover:text-white hover:bg-white/[0.04]"
  >
    + Import race
  </button>
</div>
```

At the very end of the returned JSX (before the closing `</div>` of the root `space-y-6` container), add:

```tsx
<ImportRaceModal open={importOpen} onClose={() => setImportOpen(false)} />
```

- [ ] **Step 3: Verify compilation**

Run in `race-time-front/`:
```
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```
git add race-time-front/src/app/heats/components/HeatsList.tsx
git commit -m "feat(front): Import race button on /heats"
```

---

## Task 12: End-to-end UI smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Set the parser URL**

Ensure `race-time-front/.env.local` contains:
```
NEXT_PUBLIC_PARSER_URL=http://localhost:3001
```
Ask the user to add it if missing — do not edit `.env.local` without confirmation.

- [ ] **Step 2: Start both services**

In one shell (from `timing-parser/`):
```
npm run start:dev
```
In a second shell (from `race-time-front/`):
```
npm run dev
```

- [ ] **Step 3: Browser flow**

1. Open `http://localhost:3000/heats`.
2. Click **+ Import race**.
3. Enter a real racemann URL (e.g. `https://pitstop.racemann.com/Race/id/<uuid>`) and a name.
4. Click **Import**. Expected: spinner for <~30s, then redirect to `/heats/<new-heat-id>`.
5. On the detail page, verify that laps are visible and that teams are columns (not individual drivers). Hover a cell — the visual state should be consistent with the existing heat page.

- [ ] **Step 4: Verify stint data in the DB**

In Supabase SQL editor:
```sql
select meta->'stint' as stint
from laps
where "heatId" = '<new-heat-id>'
limit 3;
```
Expected: each row shows `{ "num": N, "driver": "…", "startLap": …, "endLap": …, "startMs": …, "endMs": … }`.

- [ ] **Step 5: Verify bad input**

Back in the modal, enter `https://example.com/x` and `test`, submit. Expected: inline red message `Invalid racemann race URL`. No navigation.

- [ ] **Step 6: Stop both processes**

Ctrl+C each shell.

No commit — verification only. If any step fails, re-open the corresponding earlier task and fix before closing out.
