# Racemann race import — design

**Date:** 2026-04-19
**Status:** Approved

## 1. Summary

Add the ability to import a completed or in-progress race from the racemann timing platform (e.g. `https://pitstop.racemann.com/Race/id/<uuid>`) into the existing `heats` / `laps` tables. The import is triggered by a button on the `/heats` list page in `race-time-front`; it hits a new REST endpoint on `timing-parser`, which pulls race data from the racemann HTTP API, maps it into our schema, and persists it synchronously.

## 2. Racemann API reference

Source of truth: `timing-parser/docs/racemann-example.txt`.

### 2.1 `POST /race/GetRaceStartData`

`body` (form-urlencoded): `raceId=<uuid>`

Response (relevant fields):

```jsonc
{
  "comps": [                              // one entry per team
    {
      "rn": "1",                          // team registration number (string, numeric)
      "fn": "Hoblets",                    // team name
      "lc": 270,                          // laps completed
      "pos": 19,                          // current position
      "cs": {                             // current stint snapshot
        "n": 9, "drv": "27Смирнов Никита", "ssl": 251, "sll": 270, "ss": 13363148, "se": 14421553
      }
      // ...
    }
  ],
  "sessions": [                           // FLAT array of all stints across all comps
    {
      "rn": "1",                          // foreign key into comps
      "n": 1,                             // stint index within the team
      "drv": "27Смирнов Никита",          // driver who ran this stint
      "ssl": 1, "sll": 22,                // start/last lap number covered by the stint
      "ss": 0, "se": 1188711,             // start/end ms relative to race start
      "t": 1188711                        // total stint duration ms
      // ...
    }
  ],
  "lapsComplete": 278,
  "scheduledLaps": 0,
  "adminRaceState": { "isCurrent": false /* ... */ }
}
```

### 2.2 `POST /race/GetSessionLaps`

`body` (form-urlencoded): `raceId=<uuid>&compRegNum=<rn>&sessionNum=<n>`

Returns laps for **one** stint of **one** team:

```jsonc
{
  "laps": [
    {
      "n": 1,            // lap number (cumulative across stints for this team)
      "lt": 52019,       // lap time, ms
      "p": 2,            // position after this lap
      "rt": 110571,      // race time, ms (relative)
      "pd": { "Laps": 0, "Time": 1091 },  // pit delta
      "S1": 0, "S2": 0, "S3": 0           // sector times (often 0 at this track)
    }
  ]
}
```

To import a full race: iterate **every `(comp.rn, session.n)` pair** present in `sessions[]` and issue `GetSessionLaps` for each. For the example race: ~25 teams × ~9 stints ≈ **200 requests**.

## 3. Decisions locked in during brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | Service hosting the import endpoint | `timing-parser` (first REST controller in this service) |
| 2 | Lap schema mapping | `Lap.driverName = comp.fn` (team name); `Lap.driverExternalId = parseInt(comp.rn)`; stint info denormalized into `Lap.meta.stint` |
| 3 | Import strategy | Fully synchronous — frontend waits, spinner visible |
| 4 | Frontend UX | Button in `/heats` page header → modal with URL + Name |
| 5 | Auth on the endpoint | None (public, matches current architecture) |
| 6 | Duplicate handling | Duplicates allowed: `Heat.scheduledTimestamp = Math.floor(Date.now() / 1000)`; no pre-insert lookup; unique index untouched |
| — | Partial failures | Best-effort: all fetches happen before any DB write; if **all** fetches fail → 502 with no Heat created; otherwise insert whatever succeeded and return per-stint error list in the response |

## 4. Architecture

### 4.1 timing-parser

New domain directory `src/domains/racemann/`:

```
racemann/
├── racemann.module.ts       Nest module: controller + service + client
├── racemann.controller.ts   POST /racemann/import
├── racemann.service.ts      Orchestration: URL → fetch → transform → persist
├── racemann.client.ts       HTTP client for pitstop.racemann.com
├── racemann.mapper.ts       Racemann JSON → ParsedHeat / NewLap[]
├── racemann.types.ts        TypeScript types for racemann responses
└── dto/
    └── import-race.dto.ts   { url, name } with class-validator rules
```

### 4.2 Module wiring

- `RacemannModule` imports `TimingModule` (existing) to reuse `TimingService.upsertHeat` / `insertLap`.
- `DomainsModule` imports `RacemannModule`.
- Add `class-validator` and `class-transformer` to `timing-parser/package.json`.
- `main.ts`:
  - `app.enableCors()` — required because the request originates from `race-time-front` (different origin). Use `{ origin: true, credentials: false }` for now.
  - `app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))` — activate DTO validation.

### 4.3 race-time-front

- New env var: `NEXT_PUBLIC_PARSER_URL` (default fallback `http://localhost:3001`).
- New component `src/app/heats/components/ImportRaceModal.tsx` — self-contained modal (URL field, Name field, submit, error, loading).
- Button "Import race" added to the header of `src/app/heats/components/HeatsList.tsx` (next to the kartodrom filter).
- Submit flow: `axios.post(`${PARSER_URL}/racemann/import`, { url, name }, { timeout: 60000 })` → on success `router.push(\`/heats/${heatId}\`)`.

## 5. Data mapping

### 5.1 URL parsing

Regex: `/^https?:\/\/([a-z0-9-]+)\.racemann\.com\/Race\/id\/([0-9a-f-]{36})/i`

On match → `{ subdomain, raceId }`. On miss → `400 Bad Request: "Invalid racemann race URL"`.

### 5.2 Heat

| Heat field | Source |
|---|---|
| `kartodromId` | `"racemann-" + subdomain` (e.g. `"racemann-pitstop"`) |
| `scheduledTimestamp` | `Math.floor(Date.now() / 1000)` (unix seconds; fits int4 until 2038) |
| `name` | user input from the modal |
| `status` | `adminRaceState.isCurrent === true` → `HeatStatus.IN_PROGRESS`, else `HeatStatus.FINISHED` |
| `passAt` | `null` if in-progress, `new Date()` if finished |
| `meta` | `{ racemannRaceId, subdomain, lapsComplete, scheduledLaps, totalComps, totalSessions, importedAt: new Date().toISOString() }` |

### 5.3 Lap

For each `comp` and each stint (`session` where `session.rn === comp.rn`), fetch `GetSessionLaps(raceId, comp.rn, session.n)`. For every returned `lap`:

| Lap field | Source |
|---|---|
| `driverExternalId` | `parseInt(comp.rn, 10)` |
| `driverName` | `comp.fn` (team name) |
| `kart` | `comp.rn` (string representation of team number) |
| `lapCount` | `lap.n` |
| `time` | `lap.lt` |
| `position` | `lap.p` |
| `passAt` | `null` |
| `meta.stint` | `{ num, driver, startLap: ssl, endLap: sll, startMs: ss, endMs: se }` from the stint that contains `lap.n` (i.e. `ssl ≤ lap.n ≤ sll`). If no stint matches (edge case: gap in coverage), omit the field and log a `warn`. |
| `meta.raceTimeMs` | `lap.rt` |
| `meta.pit` | `{ laps: lap.pd.Laps, timeMs: lap.pd.Time }` if `lap.pd.Time > 0`, else omitted |
| `meta.sectors` | `{ S1, S2, S3 }` if any of them `> 0`, else omitted |

Denormalising `stint` into every lap keeps the client free of joins and matches our current pattern of fat `meta` on laps.

## 6. Flow and error handling

```
POST /racemann/import { url, name }
  1. ValidationPipe                       — invalid DTO → 400
  2. parseUrl(url) → { raceId, subdomain } — regex miss → 400
  3. client.getRaceStartData(raceId)      — network/5xx/not-JSON → 502
                                            missing comps or sessions → 502
  4. Build (comp.rn, session.n) pairs from sessions[], skipping comps with lc === 0.
     Fetch ALL pairs:
       parallel in chunks of 10
       per-pair 10 s AbortController timeout
       collect successes into sessionLaps Map<"<rn>:<n>", Lap[]>
       collect failures into errors: { stint, message }[]
     If errors.length === pairs.length → 502 "Failed to fetch laps from racemann",
       NO DB WRITE.
  5. mapper.buildHeatInput() → timingService.upsertHeat(input) → heat
  6. mapper.buildLaps(startData, sessionLaps) → for each:
       timingService.insertLap({ heat, ...lap })   // uses orIgnore already
  7. 200 { heatId, heatName, lapsInserted, stintsFetched, errors }
```

### 6.1 HTTP response codes

| Situation | Status | Body |
|---|---|---|
| Invalid DTO or URL regex miss | 400 | `{ message: string }` |
| `GetRaceStartData` network/5xx/malformed | 502 | `{ message: "Failed to fetch race data from racemann" }` |
| All `GetSessionLaps` calls failed | 502 | `{ message: "Failed to fetch laps from racemann" }` |
| DB error during Heat insert | 500 | Nest default |
| Success (full or partial) | 200 | `{ heatId, heatName, lapsInserted, stintsFetched, errors: [...] }` |

### 6.2 Timeouts and limits

- Per-request `AbortController` timeout: 10 s.
- No global import timeout on the server.
- Frontend `axios` timeout: 60 s — protects user from a hung server.

### 6.3 Logging

Service uses `Logger('RacemannService')`:

- `log("Import started: raceId=<id> subdomain=<s>")`
- `warn("Stint fetch failed: rn=<x> n=<y>: <error.message>")`
- `log("Import finished: Xms, N laps, M stints, K errors")`

## 7. Out of scope

- Deduplication (same race URL imported twice → two Heat rows, by explicit user decision).
- Background/async import.
- Authentication (public endpoint, matching current architecture).
- Migration of `scheduledTimestamp` to `bigint` (seconds resolution is sufficient until 2038).
- Racemann realtime subscription (if we ever need it, it's a separate feature).
- Handling non-standard racemann subdomains (anything matching `[a-z0-9-]+\.racemann\.com` is accepted; the subdomain becomes part of `kartodromId`).

## 8. Open risks

- **Silent schema drift in racemann API.** `racemann.client.ts` should validate the presence of `comps`/`sessions` and log with the raw raceId if shape changes. No runtime schema library (Zod/yup) to keep dependencies minimal.
- **Rate limiting.** 200 requests in 20 seconds may trip racemann's limits (unknown). Mitigation: if we observe repeated 429s in practice, lower chunk size and/or add a small delay between chunks.
- **CORS on racemann side.** Not relevant — calls are server-to-server.
- **Name column uniqueness.** `(kartodromId, scheduledTimestamp, name)` is unique, but user-entered `name` is free text. Rare collisions possible (same second of clock + same exact name + same kartodromId). Ignored by decision.
