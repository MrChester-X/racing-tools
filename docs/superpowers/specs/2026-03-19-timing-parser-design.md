# timing-parser Service Design

## Overview

Standalone NestJS service that aggregates real-time race timing data from different timing platforms. Starts with SMS Timing provider, kartodrom "pitstop-premium". Stores heats, laps, and raw messages in PostgreSQL via TypeORM.

## Project Structure

New NestJS project at `D:/Projects/Other/Racing/timing-parser`. Structure mirrors `telegram-race-timer` (app/ and domains/ folders).

```
timing-parser/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── .env                             # DB config (user-managed)
├── src/
│   ├── app.module.ts                # TypeORM, ConfigModule
│   ├── main.ts
│   ├── app/                         # (empty for now)
│   ├── domains/
│   │   ├── domains.module.ts
│   │   ├── sms-timing/
│   │   │   ├── sms-timing.module.ts
│   │   │   ├── sms-timing.gateway.ts    # WS client, reconnect, logging
│   │   │   ├── sms-timing.parser.ts     # Message parsing, diff logic
│   │   │   └── kartodrom/
│   │   │       └── pitstop-premium.config.ts
│   │   ├── timing/
│   │   │   ├── timing.module.ts
│   │   │   ├── timing.service.ts        # Upsert heats, insert laps, insert raw
│   │   │   └── entities/
│   │   │       ├── heat.entity.ts
│   │   │       ├── lap.entity.ts
│   │   │       └── raw-message.entity.ts
│   │   └── docs/
│   │       └── sms-timing-protocol.md   # Message format examples
```

## Module Responsibilities

### `timing/` — Shared DB Layer

Owns entities and database operations. Any future timing provider (not just SMS Timing) writes through this module.

- `timing.service.ts` — upsert heats, insert laps (ON CONFLICT DO NOTHING), insert raw messages
- Entities — Heat, Lap, RawMessage

### `sms-timing/` — SMS Timing Provider

Knows the SMS Timing WebSocket protocol. Connects, parses, detects new laps, delegates persistence to `timing.service`.

- `sms-timing.gateway.ts` — WebSocket client lifecycle (connect, reconnect, logging)
- `sms-timing.parser.ts` — Parses JSON messages, tracks state in memory, detects lap changes
- `kartodrom/pitstop-premium.config.ts` — Connection config for this specific kartodrom

For a new kartodrom on SMS Timing: add a new config file and register it. The rest of the logic is shared.

```typescript
interface KartodromConfig {
  id: string;          // e.g. "pitstop-premium"
  wsUrl: string;       // e.g. "wss://webserver8.sms-timing.com:10015/"
  startMessage: string; // e.g. "START 410520@pitstopnarvskaya"
}
```

## Entities

### Heat

| Field               | Type     | Notes                                      |
|---------------------|----------|--------------------------------------------|
| id                  | uuid PK  | Auto-generated                             |
| kartodromId         | string   | e.g. `"pitstop-premium"`                   |
| scheduledTimestamp  | int      | Field `T` from message (unix timestamp, seconds) |
| name                | string   | Field `N` from message                     |
| status              | enum     | `waiting`, `inProgress`, `finished`, `unknown` |
| rawStatus           | int      | Original field `S` value                   |
| raceTime            | int      | Field `C` — race elapsed time in ms. Set when `CE=0, CS=0` (pre-start). Resets to 0 on finish. |
| type                | enum     | `time`, `laps`, `unknown`                  |
| totalLaps           | int      | Top-level field `L` — total laps for a laps-type race. 0 for time-type. |
| createdAt           | timestamp| When first written                         |
| passAt              | timestamp| Nullable. Set only for real-time messages  |

**Status mapping:**
- `CE=0, CS=0, C>0` → `waiting` (heat scheduled, `C` is race time/countdown)
- `CE=1, CS=1` → `inProgress` (heat is running)
- `CE=0, CS=0, C=0` → `finished` (heat ended)
- Additionally `S=1` confirms `inProgress`, `S=4` confirms `finished`
- All other combinations → `unknown`. Mapping will be extended as new values are discovered.

**Unique index:** `[kartodromId, scheduledTimestamp, name]`

**Type mapping:** `E=1` → `time` (heat by time), `E=2` → `laps` (heat by laps), other → `unknown`.

**UPSERT:** On conflict, update `status`, `rawStatus`, `raceTime`, `type`, `totalLaps`, `passAt`.

### Lap

| Field             | Type     | Notes                                         |
|-------------------|----------|-----------------------------------------------|
| id                | uuid PK  | Auto-generated                                |
| heatId            | uuid FK  | ManyToOne -> Heat                             |
| driverName        | string   | Field `N` from `D[]`                          |
| kart              | string   | Field `K`                                     |
| position          | int      | Field `P`                                     |
| lapCount          | int      | Field `L`                                     |
| time              | int      | Field `T` from `D[]` (last lap time in ms)    |
| avgTime           | int      | Field `A` from `D[]`                          |
| bestTime          | int      | Field `B`                                     |
| gap               | string   | Field `G`, empty string stored as-is          |
| driverExternalId  | bigint   | Field `D`                                     |
| createdAt         | timestamp| When written                                  |
| passAt            | timestamp| Nullable. Set only for real-time messages     |

**Unique index:** `[heatId, driverExternalId, lapCount]` — prevents duplicate inserts from multiple instances.

**Insert strategy:** ON CONFLICT DO NOTHING (silently skip duplicates).

### RawMessage

| Field       | Type      | Notes                              |
|-------------|-----------|------------------------------------|
| id          | uuid PK   | Auto-generated                     |
| kartodromId | string    | Which kartodrom sent this          |
| data        | jsonb     | Full message as-is                 |
| createdAt   | timestamp | When received                      |

## WebSocket Client (sms-timing.gateway.ts)

### Connection Lifecycle

1. On `onModuleInit`, connect to WSS for each registered kartodrom
2. Send start message (e.g. `START 410520@pitstopnarvskaya`)
3. First received message after connect is "historical" (no `passAt`)
4. All subsequent messages are real-time (set `passAt = now()`)

### Reconnect

- On disconnect/error: reconnect after 1 second, always
- After reconnect, first message is again treated as historical
- Log every connect, disconnect, reconnect, and error event

### Message Processing Flow

1. Receive raw message string
2. Try to parse as JSON; if fails, log and ignore (could be text response to START)
3. Insert raw message into `raw_messages` table
4. Parse heat data, upsert into `heats`
5. Compare each driver's `L` (lap count) with previous state held in memory
6. If `L` increased, insert new lap record
7. If `L` is 0, skip (driver hasn't completed a lap yet)
8. Update in-memory state with current message

## Diff Logic (sms-timing.parser.ts)

- Maintains `Map<string, SmtTimingMessage>` keyed by kartodromId — last received message per kartodrom
- On new message: iterate `D[]` array, compare each driver's `L` with the stored value
- New lap detected when: driver's `L` > previously stored `L` for that `driverExternalId`
- On first message after connect (historical): store state in memory, do NOT create laps
- All subsequent messages: compare with stored state and insert laps where `L` increased
- Per-kartodrom `isFirstMessage: boolean` flag, resets to `true` on each reconnect

## Multi-Instance Safety

- Multiple app instances may connect to the same kartodrom simultaneously
- Each instance processes messages independently
- DB unique indexes prevent duplicate records
- Heat: UPSERT (ON CONFLICT UPDATE) — last write wins, which is fine since data converges
- Lap: INSERT with ON CONFLICT DO NOTHING — first write wins, duplicates silently dropped
- RawMessage: no deduplication (each instance logs its own copy, acceptable for debug table)

## Error Handling

- Non-JSON WS messages: log warning, skip
- DB unique constraint violation on lap insert: catch and ignore
- WS connection failure: log error, retry in 1 second
- Unexpected message structure (missing fields): log warning, skip

## Graceful Shutdown

On `onModuleDestroy`, close all open WebSocket connections cleanly to avoid resource leaks.

## Logging

Use NestJS `Logger` class with class name as context (e.g. `new Logger(SmtTimingGateway.name)`).

## Unmapped SMS Timing Fields

The following fields from SMS Timing messages are NOT mapped to entities but are preserved in `raw_messages` (jsonb). Their meaning is unknown and will be documented in `sms-timing-protocol.md` as discovered:

**Top-level:** `EM`, `R`

**Mapped top-level:** `CE` (clock enabled), `CS` (clock started), `C` (race elapsed time) — used for status detection; `E` (heat type: 1=time, 2=laps), `L` (total laps for laps-type race) — see Heat entity

**Driver-level (`D[]`):** `LP`, `M`, `R`

## What We're NOT Doing (YAGNI)

- No REST endpoints
- No Swagger
- No DB migrations (using `synchronize: true`)
- No authentication
- No message queue between instances
