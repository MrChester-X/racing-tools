# timing-parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a NestJS service that connects to SMS Timing WebSocket, parses real-time race data, and stores heats/laps in PostgreSQL.

**Architecture:** Separate NestJS project with two domain modules: `timing` (shared DB layer with entities and persistence) and `sms-timing` (WebSocket client for SMS Timing protocol). The sms-timing module detects new laps by diffing incoming messages against in-memory state, then delegates persistence to the timing module.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, `ws` (WebSocket client), Node.js

**Spec:** `docs/superpowers/specs/2026-03-19-timing-parser-design.md`

---

## File Structure

```
timing-parser/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── .prettierrc
├── .eslintrc.js
├── .gitignore
├── .env.example
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── domains/
│   │   ├── domains.module.ts
│   │   ├── timing/
│   │   │   ├── timing.module.ts
│   │   │   ├── timing.service.ts
│   │   │   └── entities/
│   │   │       ├── heat.entity.ts
│   │   │       ├── heat-status.enum.ts
│   │   │       ├── heat-type.enum.ts
│   │   │       ├── lap.entity.ts
│   │   │       └── raw-message.entity.ts
│   │   ├── sms-timing/
│   │   │   ├── sms-timing.module.ts
│   │   │   ├── sms-timing.gateway.ts
│   │   │   ├── sms-timing.parser.ts
│   │   │   ├── sms-timing.types.ts
│   │   │   └── kartodrom/
│   │   │       ├── kartodrom.config.ts
│   │   │       └── pitstop-premium.config.ts
│   │   └── docs/
│   │       └── sms-timing-protocol.md
```

---

### Task 1: Scaffold NestJS Project

**Files:**
- Create: `timing-parser/package.json`
- Create: `timing-parser/tsconfig.json`
- Create: `timing-parser/tsconfig.build.json`
- Create: `timing-parser/nest-cli.json`
- Create: `timing-parser/.prettierrc`
- Create: `timing-parser/.eslintrc.js`
- Create: `timing-parser/.gitignore`
- Create: `timing-parser/.env.example`
- Create: `timing-parser/src/main.ts`
- Create: `timing-parser/src/app.module.ts`
- Create: `timing-parser/src/domains/domains.module.ts`

- [ ] **Step 1: Create project directory and package.json**

```json
{
  "name": "timing-parser",
  "version": "0.0.1",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.5",
    "@nestjs/config": "^4.0.2",
    "@nestjs/core": "^11.1.5",
    "@nestjs/platform-express": "^11.1.5",
    "@nestjs/typeorm": "^11.0.0",
    "pg": "^8.16.3",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.25",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@types/node": "^20.3.1",
    "@types/ws": "^8.5.13",
    "@typescript-eslint/eslint-plugin": "^5.59.11",
    "@typescript-eslint/parser": "^5.59.11",
    "eslint": "^8.42.0",
    "eslint-config-prettier": "^8.8.0",
    "eslint-plugin-prettier": "^4.2.1",
    "prettier": "^2.8.8",
    "ts-loader": "^9.4.3",
    "ts-node": "^10.9.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.1.3"
  }
}
```

- [ ] **Step 2: Create config files**

`tsconfig.json` — copy from `telegram-race-timer`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

`nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

`.prettierrc`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120
}
```

`.eslintrc.js`:
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'max-len': [0, { code: 999 }],
    'no-useless-catch': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
```

`.gitignore`:
```
/dist
/node_modules
.DS_Store
.env
/.idea
.vscode/*
```

`.env.example`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=racing
PORT=3001
```

- [ ] **Step 3: Create app.module.ts**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainsModule } from './domains/domains.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'racing'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    DomainsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Create main.ts**

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT || 3001);

  const appUri = await app.getUrl();
  Logger.log(`Application is running on: ${appUri}`);
}

bootstrap();
```

- [ ] **Step 5: Create empty domains.module.ts**

```typescript
// src/domains/domains.module.ts
import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class DomainsModule {}
```

- [ ] **Step 6: Install dependencies and verify build**

Run from `timing-parser/`:
```bash
npm install
npm run build
```
Expected: Build completes with no errors.

- [ ] **Step 7: Init git and commit**

```bash
git init
git add .
git commit -m "feat: scaffold timing-parser NestJS project"
```

---

### Task 2: Create Entities and Enums

**Files:**
- Create: `src/domains/timing/entities/heat-status.enum.ts`
- Create: `src/domains/timing/entities/heat-type.enum.ts`
- Create: `src/domains/timing/entities/heat.entity.ts`
- Create: `src/domains/timing/entities/lap.entity.ts`
- Create: `src/domains/timing/entities/raw-message.entity.ts`

- [ ] **Step 1: Create HeatStatus enum**

```typescript
// src/domains/timing/entities/heat-status.enum.ts
export enum HeatStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'inProgress',
  FINISHED = 'finished',
  UNKNOWN = 'unknown',
}
```

- [ ] **Step 2: Create HeatType enum**

```typescript
// src/domains/timing/entities/heat-type.enum.ts
export enum HeatType {
  TIME = 'time',
  LAPS = 'laps',
  UNKNOWN = 'unknown',
}
```

- [ ] **Step 3: Create Heat entity**

```typescript
// src/domains/timing/entities/heat.entity.ts
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { HeatStatus } from './heat-status.enum';
import { HeatType } from './heat-type.enum';
import { Lap } from './lap.entity';

@Entity('heats')
@Index(['kartodromId', 'scheduledTimestamp', 'name'], { unique: true })
export class Heat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  kartodromId: string;

  @Column('int')
  scheduledTimestamp: number;

  @Column('varchar')
  name: string;

  @Column({ type: 'enum', enum: HeatStatus, default: HeatStatus.UNKNOWN })
  status: HeatStatus;

  @Column('int')
  rawStatus: number;

  @Column({ type: 'int', default: 0 })
  raceTime: number;

  @Column({ type: 'enum', enum: HeatType, default: HeatType.UNKNOWN })
  type: HeatType;

  @Column({ type: 'int', default: 0 })
  totalLaps: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  passAt: Date | null;

  @OneToMany(() => Lap, (lap) => lap.heat)
  laps: Lap[];
}
```

- [ ] **Step 4: Create Lap entity**

```typescript
// src/domains/timing/entities/lap.entity.ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Heat } from './heat.entity';

@Entity('laps')
@Index(['heatId', 'driverExternalId', 'lapCount'], { unique: true })
export class Lap {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Heat, (heat) => heat.laps, { eager: true })
  @JoinColumn({ name: 'heatId' })
  heat: Heat;

  @Column('varchar')
  driverName: string;

  @Column('varchar')
  kart: string;

  @Column('int')
  position: number;

  @Column('int')
  lapCount: number;

  @Column('int')
  time: number;

  @Column('int')
  avgTime: number;

  @Column('int')
  bestTime: number;

  @Column('varchar')
  gap: string;

  @Column('int')
  driverExternalId: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  passAt: Date | null;
}
```

- [ ] **Step 5: Create RawMessage entity**

```typescript
// src/domains/timing/entities/raw-message.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('raw_messages')
export class RawMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  kartodromId: string;

  @Column({ type: 'jsonb' })
  data: any;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/domains/timing/entities/
git commit -m "feat: add Heat, Lap, RawMessage entities with enums"
```

---

### Task 3: Create Timing Module and Service

**Files:**
- Create: `src/domains/timing/timing.module.ts`
- Create: `src/domains/timing/timing.service.ts`
- Modify: `src/domains/domains.module.ts`

- [ ] **Step 1: Create timing.service.ts**

This service handles all DB operations: upsert heats, insert laps (ON CONFLICT DO NOTHING), insert raw messages.

```typescript
// src/domains/timing/timing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Heat } from './entities/heat.entity';
import { Lap } from './entities/lap.entity';
import { RawMessage } from './entities/raw-message.entity';
import { HeatStatus } from './entities/heat-status.enum';
import { HeatType } from './entities/heat-type.enum';

@Injectable()
export class TimingService {
  private readonly logger = new Logger(TimingService.name);

  constructor(
    @InjectRepository(Heat)
    private readonly heatRepository: Repository<Heat>,
    @InjectRepository(Lap)
    private readonly lapRepository: Repository<Lap>,
    @InjectRepository(RawMessage)
    private readonly rawMessageRepository: Repository<RawMessage>,
  ) {}

  async upsertHeat(data: {
    kartodromId: string;
    scheduledTimestamp: number;
    name: string;
    status: HeatStatus;
    rawStatus: number;
    raceTime: number;
    type: HeatType;
    totalLaps: number;
    passAt: Date | null;
  }): Promise<Heat> {
    const result = await this.heatRepository
      .createQueryBuilder()
      .insert()
      .into(Heat)
      .values(data)
      .orUpdate(['status', 'rawStatus', 'raceTime', 'type', 'totalLaps', 'passAt'], ['kartodromId', 'scheduledTimestamp', 'name'])
      .returning('*')
      .execute();

    return result.raw[0] as Heat;
  }

  async insertLap(data: {
    heat: Heat;
    driverName: string;
    kart: string;
    position: number;
    lapCount: number;
    time: number;
    avgTime: number;
    bestTime: number;
    gap: string;
    driverExternalId: number;
    passAt: Date | null;
  }): Promise<boolean> {
    try {
      await this.lapRepository
        .createQueryBuilder()
        .insert()
        .into(Lap)
        .values({ ...data, heat: { id: data.heat.id } as any })
        .orIgnore()
        .execute();
      return true;
    } catch (err) {
      this.logger.warn(`Failed to insert lap: ${err.message}`);
      return false;
    }
  }

  async insertRawMessage(kartodromId: string, data: any): Promise<void> {
    await this.rawMessageRepository.save({ kartodromId, data });
  }
}
```

- [ ] **Step 2: Create timing.module.ts**

```typescript
// src/domains/timing/timing.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Heat } from './entities/heat.entity';
import { Lap } from './entities/lap.entity';
import { RawMessage } from './entities/raw-message.entity';
import { TimingService } from './timing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Heat, Lap, RawMessage])],
  providers: [TimingService],
  exports: [TimingService],
})
export class TimingModule {}
```

- [ ] **Step 3: Update domains.module.ts**

```typescript
// src/domains/domains.module.ts
import { Module } from '@nestjs/common';
import { TimingModule } from './timing/timing.module';

@Module({
  imports: [TimingModule],
})
export class DomainsModule {}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/domains/timing/ src/domains/domains.module.ts
git commit -m "feat: add TimingModule with upsert/insert DB operations"
```

---

### Task 4: Create SMS Timing Types and Kartodrom Config

**Files:**
- Create: `src/domains/sms-timing/sms-timing.types.ts`
- Create: `src/domains/sms-timing/kartodrom/kartodrom.config.ts`
- Create: `src/domains/sms-timing/kartodrom/pitstop-premium.config.ts`

- [ ] **Step 1: Create TypeScript types for SMS Timing messages**

```typescript
// src/domains/sms-timing/sms-timing.types.ts
export interface SmtTimingDriver {
  LP: number;
  A: number;   // avg time
  B: number;   // best time
  K: string;   // kart number
  G: string;   // gap
  D: number;   // driver external id
  L: number;   // lap count
  T: number;   // last lap time (ms)
  R: number;   // unknown
  N: string;   // driver name
  P: number;   // position
  M: number;   // unknown
}

export interface SmtTimingMessage {
  T: number;   // scheduled timestamp (unix seconds)
  CE: number;  // clock enabled (0/1)
  CS: number;  // clock started (0/1)
  D: SmtTimingDriver[];
  EM: number;  // unknown
  C: number;   // race elapsed time (ms)
  N: string;   // heat name
  E: number;   // heat type (1=time, 2=laps)
  R: number;   // unknown
  L: number;   // total laps (for laps-type race)
  S: number;   // status (1=inProgress, 4=finished)
}
```

- [ ] **Step 2: Create kartodrom config interface and registry**

```typescript
// src/domains/sms-timing/kartodrom/kartodrom.config.ts
export interface KartodromConfig {
  id: string;
  wsUrl: string;
  startMessage: string;
}
```

- [ ] **Step 3: Create pitstop-premium config**

```typescript
// src/domains/sms-timing/kartodrom/pitstop-premium.config.ts
import { KartodromConfig } from './kartodrom.config';

export const pitstopPremiumConfig: KartodromConfig = {
  id: 'pitstop-premium',
  wsUrl: 'wss://webserver8.sms-timing.com:10015/',
  startMessage: 'START 410520@pitstopnarvskaya',
};
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/domains/sms-timing/
git commit -m "feat: add SMS Timing types and pitstop-premium kartodrom config"
```

---

### Task 5: Create SMS Timing Parser (Diff Logic)

**Files:**
- Create: `src/domains/sms-timing/sms-timing.parser.ts`

- [ ] **Step 1: Create the parser with diff logic**

The parser tracks the last message per kartodrom in memory. It compares incoming messages with the stored state to detect new laps (when a driver's `L` increases). It also maps SMS Timing fields to Heat status/type enums.

```typescript
// src/domains/sms-timing/sms-timing.parser.ts
import { Injectable, Logger } from '@nestjs/common';
import { SmtTimingDriver, SmtTimingMessage } from './sms-timing.types';
import { HeatStatus } from '../timing/entities/heat-status.enum';
import { HeatType } from '../timing/entities/heat-type.enum';

export interface ParsedHeat {
  scheduledTimestamp: number;
  name: string;
  status: HeatStatus;
  rawStatus: number;
  raceTime: number;
  type: HeatType;
  totalLaps: number;
}

export interface NewLap {
  driverName: string;
  kart: string;
  position: number;
  lapCount: number;
  time: number;
  avgTime: number;
  bestTime: number;
  gap: string;
  driverExternalId: number;
}

@Injectable()
export class SmtTimingParser {
  private readonly logger = new Logger(SmtTimingParser.name);
  private lastState = new Map<string, Map<number, SmtTimingDriver>>();

  parseMessage(raw: string): SmtTimingMessage | null {
    try {
      const msg = JSON.parse(raw);
      if (!msg.D || !msg.N || msg.T === undefined) {
        this.logger.warn(`Message missing required fields (D, N, T): ${raw.substring(0, 100)}`);
        return null;
      }
      return msg as SmtTimingMessage;
    } catch {
      this.logger.warn(`Failed to parse message as JSON: ${raw.substring(0, 100)}`);
      return null;
    }
  }

  parseHeat(msg: SmtTimingMessage): ParsedHeat {
    return {
      scheduledTimestamp: msg.T,
      name: msg.N,
      status: this.resolveStatus(msg),
      rawStatus: msg.S,
      raceTime: msg.C,
      type: this.resolveType(msg.E),
      totalLaps: msg.L,
    };
  }

  detectNewLaps(kartodromId: string, msg: SmtTimingMessage, isFirstMessage: boolean): NewLap[] {
    const prevDrivers = this.lastState.get(kartodromId);
    const currentDrivers = new Map<number, SmtTimingDriver>();
    for (const d of msg.D) {
      currentDrivers.set(d.D, d);
    }

    this.lastState.set(kartodromId, currentDrivers);

    if (isFirstMessage) {
      this.logger.log(`Stored initial state for ${kartodromId}: ${msg.D.length} drivers`);
      return [];
    }

    const newLaps: NewLap[] = [];

    for (const driver of msg.D) {
      if (driver.L === 0) continue;

      const prev = prevDrivers?.get(driver.D);
      const prevLapCount = prev?.L ?? 0;

      if (driver.L > prevLapCount) {
        newLaps.push({
          driverName: driver.N,
          kart: driver.K,
          position: driver.P,
          lapCount: driver.L,
          time: driver.T,
          avgTime: driver.A,
          bestTime: driver.B,
          gap: driver.G,
          driverExternalId: driver.D,
        });
      }
    }

    return newLaps;
  }

  resetState(kartodromId: string): void {
    this.lastState.delete(kartodromId);
  }

  private resolveStatus(msg: SmtTimingMessage): HeatStatus {
    if (msg.CE === 0 && msg.CS === 0 && msg.C === 0) return HeatStatus.FINISHED;
    if (msg.CE === 0 && msg.CS === 0 && msg.C > 0) return HeatStatus.WAITING;
    if (msg.CE === 1 && msg.CS === 1) return HeatStatus.IN_PROGRESS;
    if (msg.S === 1) return HeatStatus.IN_PROGRESS;
    if (msg.S === 4) return HeatStatus.FINISHED;
    return HeatStatus.UNKNOWN;
  }

  private resolveType(e: number): HeatType {
    if (e === 1) return HeatType.TIME;
    if (e === 2) return HeatType.LAPS;
    return HeatType.UNKNOWN;
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/domains/sms-timing/sms-timing.parser.ts
git commit -m "feat: add SMS Timing parser with diff logic for lap detection"
```

---

### Task 6: Create SMS Timing Gateway (WebSocket Client)

**Files:**
- Create: `src/domains/sms-timing/sms-timing.gateway.ts`

- [ ] **Step 1: Create the WebSocket gateway**

This is the core WebSocket client. It connects to each kartodrom on module init, sends the start message, handles incoming messages, reconnects on disconnect/error with 1s delay, and delegates parsing + persistence to the parser and timing service.

```typescript
// src/domains/sms-timing/sms-timing.gateway.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import { KartodromConfig } from './kartodrom/kartodrom.config';
import { SmtTimingParser } from './sms-timing.parser';
import { TimingService } from '../timing/timing.service';
import { pitstopPremiumConfig } from './kartodrom/pitstop-premium.config';

const KARTODROM_CONFIGS: KartodromConfig[] = [pitstopPremiumConfig];

@Injectable()
export class SmtTimingGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmtTimingGateway.name);
  private connections = new Map<string, WebSocket>();
  private isFirstMessage = new Map<string, boolean>();
  private shouldReconnect = true;

  constructor(
    private readonly parser: SmtTimingParser,
    private readonly timingService: TimingService,
  ) {}

  onModuleInit() {
    for (const config of KARTODROM_CONFIGS) {
      this.connect(config);
    }
  }

  onModuleDestroy() {
    this.shouldReconnect = false;
    for (const [id, ws] of this.connections) {
      this.logger.log(`Closing connection to ${id}`);
      ws.close();
    }
    this.connections.clear();
  }

  private connect(config: KartodromConfig) {
    this.logger.log(`Connecting to ${config.id} at ${config.wsUrl}`);
    this.isFirstMessage.set(config.id, true);
    this.parser.resetState(config.id);

    const ws = new WebSocket(config.wsUrl);
    this.connections.set(config.id, ws);

    ws.on('open', () => {
      this.logger.log(`Connected to ${config.id}, sending start message`);
      ws.send(config.startMessage);
    });

    ws.on('message', (data: WebSocket.Data) => {
      const raw = data.toString();
      this.handleMessage(config.id, raw).catch((err) => {
        this.logger.error(`Error handling message for ${config.id}: ${err.message}`);
      });
    });

    ws.on('close', () => {
      this.logger.warn(`Connection closed for ${config.id}`);
      this.scheduleReconnect(config);
    });

    ws.on('error', (err: Error) => {
      this.logger.error(`WebSocket error for ${config.id}: ${err.message}`);
    });
  }

  private async handleMessage(kartodromId: string, raw: string) {
    const msg = this.parser.parseMessage(raw);
    if (!msg) return;

    const isFirst = this.isFirstMessage.get(kartodromId) ?? true;
    if (isFirst) {
      this.isFirstMessage.set(kartodromId, false);
    }

    const passAt = isFirst ? null : new Date();

    await this.timingService.insertRawMessage(kartodromId, msg);

    const parsedHeat = this.parser.parseHeat(msg);
    const heat = await this.timingService.upsertHeat({
      kartodromId,
      ...parsedHeat,
      passAt,
    });

    const newLaps = this.parser.detectNewLaps(kartodromId, msg, isFirst);
    for (const lap of newLaps) {
      const inserted = await this.timingService.insertLap({
        heat,
        ...lap,
        passAt,
      });
      if (inserted) {
        this.logger.log(`New lap: ${lap.driverName} (kart ${lap.kart}) lap #${lap.lapCount} - ${lap.time}ms`);
      }
    }
  }

  private scheduleReconnect(config: KartodromConfig) {
    if (!this.shouldReconnect) return;
    this.logger.log(`Reconnecting to ${config.id} in 1s...`);
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect(config);
      }
    }, 1000);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/domains/sms-timing/sms-timing.gateway.ts
git commit -m "feat: add SMS Timing WebSocket gateway with auto-reconnect"
```

---

### Task 7: Create SMS Timing Module and Wire Everything Together

**Files:**
- Create: `src/domains/sms-timing/sms-timing.module.ts`
- Modify: `src/domains/domains.module.ts`

- [ ] **Step 1: Create sms-timing.module.ts**

```typescript
// src/domains/sms-timing/sms-timing.module.ts
import { Module } from '@nestjs/common';
import { TimingModule } from '../timing/timing.module';
import { SmtTimingGateway } from './sms-timing.gateway';
import { SmtTimingParser } from './sms-timing.parser';

@Module({
  imports: [TimingModule],
  providers: [SmtTimingGateway, SmtTimingParser],
})
export class SmtTimingModule {}
```

- [ ] **Step 2: Update domains.module.ts**

```typescript
// src/domains/domains.module.ts
import { Module } from '@nestjs/common';
import { TimingModule } from './timing/timing.module';
import { SmtTimingModule } from './sms-timing/sms-timing.module';

@Module({
  imports: [TimingModule, SmtTimingModule],
})
export class DomainsModule {}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/domains/sms-timing/sms-timing.module.ts src/domains/domains.module.ts
git commit -m "feat: wire SmtTimingModule into DomainsModule"
```

---

### Task 8: Create SMS Timing Protocol Documentation

**Files:**
- Create: `src/domains/docs/sms-timing-protocol.md`

- [ ] **Step 1: Create protocol documentation with examples**

```markdown
# SMS Timing WebSocket Protocol

## Connection

- URL: `wss://webserver8.sms-timing.com:10015/` (varies per kartodrom)
- After connecting, send a start message: `START 410520@pitstopnarvskaya` (varies per kartodrom)
- Server responds with JSON messages containing race state

## Message Format

### Top-Level Fields

| Field | Type   | Description                                              |
|-------|--------|----------------------------------------------------------|
| T     | number | Scheduled timestamp (unix seconds)                       |
| CE    | number | Clock enabled (0/1)                                      |
| CS    | number | Clock started (0/1)                                      |
| D     | array  | Array of driver data                                     |
| EM    | number | Unknown                                                  |
| C     | number | Race elapsed time (ms). >0 pre-start, 0 after finish     |
| N     | string | Heat name                                                |
| E     | number | Heat type: 1=by time, 2=by laps                          |
| R     | number | Unknown                                                  |
| L     | number | Total laps (for laps-type race, 0 for time-type)         |
| S     | number | Status: 1=in progress, 4=finished                        |

### Driver Fields (D[])

| Field | Type   | Description                                              |
|-------|--------|----------------------------------------------------------|
| LP    | number | Unknown                                                  |
| A     | number | Average time (ms)                                        |
| B     | number | Best lap time (ms)                                       |
| K     | string | Kart number                                              |
| G     | string | Gap to leader (e.g. "+01.265"), empty for P1             |
| D     | number | Driver external ID                                       |
| L     | number | Completed lap count                                      |
| T     | number | Last lap time (ms)                                       |
| R     | number | Unknown                                                  |
| N     | string | Driver name                                              |
| P     | number | Current position                                         |
| M     | number | Unknown                                                  |

## Heat State Machine

```
CE=0, CS=0, C>0  → WAITING (heat scheduled, C = countdown/race time)
CE=1, CS=1        → IN_PROGRESS (heat is running)
CE=0, CS=0, C=0   → FINISHED (heat ended)
```

## Examples

### In Progress (by laps, E=2)

```json
{"T":1773951300,"CE":1,"CS":1,"D":[{"LP":0,"A":62149,"B":59227,"K":"2","G":"","D":19086130,"L":6,"T":64740,"R":5,"N":"Мишаня","P":1,"M":0},{"LP":0,"A":62644,"B":59981,"K":"1","G":"+01.265","D":19086075,"L":6,"T":65428,"R":5,"N":"Venda","P":2,"M":0},{"LP":0,"A":62834,"B":59622,"K":"14","G":"+01.360","D":19086016,"L":6,"T":63953,"R":5,"N":"Никита","P":3,"M":0},{"LP":0,"A":62438,"B":60864,"K":"19","G":"+01.525","D":19086105,"L":6,"T":63371,"R":5,"N":"yakovdom","P":4,"M":0},{"LP":0,"A":63148,"B":60579,"K":"41","G":"+04.928","D":19086098,"L":6,"T":63604,"R":5,"N":"Antony Green","P":5,"M":0},{"LP":0,"A":62973,"B":60315,"K":"10","G":"+05.602","D":19086134,"L":6,"T":65330,"R":5,"N":"PitStop4ik","P":6,"M":0}],"EM":0,"C":439916,"N":"[HEAT] 46 - Гонка новичков - финал","E":2,"R":0,"L":5,"S":1}
```

### Finished (CE=0, CS=0, C=0, S=4)

```json
{"T":1773951300,"CE":0,"CS":0,"D":[{"LP":0,"A":62932,"B":59227,"K":"2","G":"","D":19086130,"L":11,"T":64216,"R":5,"N":"Мишаня","P":1,"M":0},{"LP":0,"A":63199,"B":59622,"K":"14","G":"+00.195","D":19086016,"L":11,"T":62897,"R":5,"N":"Никита","P":2,"M":0},{"LP":0,"A":63181,"B":59981,"K":"1","G":"+01.044","D":19086075,"L":11,"T":63450,"R":5,"N":"Venda","P":3,"M":0},{"LP":0,"A":63087,"B":60864,"K":"19","G":"+01.502","D":19086105,"L":11,"T":63216,"R":5,"N":"yakovdom","P":4,"M":0},{"LP":0,"A":63214,"B":60579,"K":"41","G":"+02.048","D":19086098,"L":11,"T":62536,"R":5,"N":"Antony Green","P":5,"M":0},{"LP":0,"A":63171,"B":60315,"K":"10","G":"+03.286","D":19086134,"L":11,"T":64265,"R":5,"N":"PitStop4ik","P":6,"M":0}],"EM":0,"C":0,"N":"[HEAT] 46 - Гонка новичков - финал","E":2,"R":0,"L":0,"S":4}
```

- [ ] **Step 2: Commit**

```bash
git add src/domains/docs/
git commit -m "docs: add SMS Timing WebSocket protocol documentation"
```

---

### Task 9: Manual Integration Test

- [ ] **Step 1: Create .env file**

Copy `.env.example` to `.env` and fill in real database credentials.

- [ ] **Step 2: Start the application**

```bash
npm run start:dev
```

Expected: Application starts, connects to WebSocket, logs connection events. If a heat is running, you should see lap inserts logged.

- [ ] **Step 3: Verify database tables**

Connect to PostgreSQL and check:
```sql
SELECT * FROM heats ORDER BY "createdAt" DESC LIMIT 5;
SELECT * FROM laps ORDER BY "createdAt" DESC LIMIT 10;
SELECT * FROM raw_messages ORDER BY "createdAt" DESC LIMIT 5;
```

Expected: Tables exist, raw_messages has entries, heats has entries.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: ready for integration testing"
```
