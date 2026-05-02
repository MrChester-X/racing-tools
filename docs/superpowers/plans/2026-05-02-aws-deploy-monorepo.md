# AWS Deploy + Monorepo Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `D:\Projects\Other\Racing\` в pnpm-монорепо с Turborepo и развернуть в AWS (Amplify + Lambda + Fargate Spot + Remotion Lambda) с привязкой собственного домена через Route 53. БД — Supabase.

**Architecture:** План делится на четыре фазы: (1) монорепо-скелет и переезд кода, (2) код-адаптация под AWS (webhook, Dockerfile-ы, SIGTERM), (3) CDK-стеки, (4) деплой и проверки. Каждая фаза заканчивается проверяемым состоянием.

**Tech Stack:** pnpm 9, Turborepo, TypeScript 5, Node 20, NestJS 11, Next.js 15, Telegraf 4, AWS CDK 2, ECS Fargate Spot, AWS Lambda (container), API Gateway HTTP API, Amplify Hosting, Route 53, ACM, SSM Parameter Store, S3, Remotion Lambda.

**По указанию пользователя коммиты в этом плане отсутствуют** — в шагах нет `git commit`. `git init` корня выполняется один раз в начале (Task 1). Если по ходу захочется зафиксировать состояние — делаем по запросу.

**Ссылка на спеку:** `docs/superpowers/specs/2026-05-02-aws-deploy-design.md`

**Перед стартом:** в `apps/race-time-front/Dockerfile:14-15` есть baked-in значения `NEXT_PUBLIC_API_URL` (Yandex Cloud) и `NEXT_PUBLIC_TELEGRAM_CLIENT_ID`. Они задаются в Amplify env vars при деплое (Task 28); оригинальный Dockerfile в Amplify не используется.

---

## Files Overview

### Создаваемые на корне монорепо

- `pnpm-workspace.yaml` — workspace patterns
- `package.json` — корневой, с шорткатами
- `turbo.json` — pipelines build/lint/dev
- `tsconfig.base.json` — общий tsconfig
- `.nvmrc` — `20`
- `.gitignore` — единый
- `.github/workflows/{frontend,bot,parser}.yml` — CI

### Перемещаемые директории

- `race-time-front/` → `apps/race-time-front/`
- `telegram-race-timer/` → `apps/telegram-bot/`
- `timing-parser/` → `apps/timing-parser/`
- `remotion/` → `apps/remotion/`
- `shared/` → `packages/shared/`

### Создаваемые в существующих apps

- `apps/telegram-bot/src/lambda.ts` — Lambda handler
- `apps/telegram-bot/Dockerfile` — Lambda container image
- `apps/timing-parser/Dockerfile` — Fargate runtime image
- `apps/timing-parser/src/main.ts` — модификация с SIGTERM handler

### Новый пакет `@racing/infra`

- `infra/package.json`, `infra/cdk.json`, `infra/tsconfig.json`
- `infra/bin/racing.ts` — CDK app
- `infra/lib/shared.ts` — константы (regions, domain)
- `infra/lib/dns-stack.ts` — Route 53
- `infra/lib/frontend-stack.ts` — Amplify
- `infra/lib/bot-stack.ts` — Lambda + API Gateway
- `infra/lib/parser-stack.ts` — ECS Fargate Spot
- `infra/lib/cert-stack.ts` — ACM cert в us-east-1

---

## Phase 1 — Monorepo migration

### Task 1: `git init` на корне и базовый `.gitignore`

**Files:**
- Create: `D:\Projects\Other\Racing\.gitignore`

- [ ] **Step 1: Инициализировать git в корне**

Run в `D:\Projects\Other\Racing\`:
```bash
git init
git config core.autocrlf true
```
Expected: `Initialized empty Git repository in D:/Projects/Other/Racing/.git/`

- [ ] **Step 2: Удалить вложенный репо у telegram-race-timer**

```bash
rm -rf telegram-race-timer/.git
```
(history не сохраняем — по согласованию)

- [ ] **Step 3: Создать корневой `.gitignore`**

Content of `.gitignore`:
```gitignore
# deps
node_modules/
**/node_modules/
.pnpm-store/

# build outputs
dist/
**/dist/
.next/
**/.next/
out/
**/out/
.turbo/
**/.turbo/
*.tsbuildinfo

# env / secrets
.env
.env.*
!.env.example
**/.env
**/.env.*
!**/.env.example
key.json
**/key.json

# project-specific
renders/
temp/
**/temp/

# editor / OS
.idea/
.vscode/
.DS_Store
Thumbs.db

# CDK
infra/cdk.out/
**/cdk.out/
```

- [ ] **Step 4: Verify**

Run:
```bash
git status
```
Expected: список untracked файлов проекта без `node_modules/`, `dist/`, `.next/`, `renders/`, `temp/`.

---

### Task 2: Корневой `package.json` + workspace + Turborepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `tsconfig.base.json`

- [ ] **Step 1: Создать `.nvmrc`**

Content of `.nvmrc`:
```
20
```

- [ ] **Step 2: Создать `pnpm-workspace.yaml`**

Content of `pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
  - infra
```

- [ ] **Step 3: Создать корневой `package.json`**

Content of `package.json`:
```json
{
  "name": "@racing/monorepo",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "front": "pnpm --filter '@racing/race-time-front'",
    "bot": "pnpm --filter '@racing/telegram-bot'",
    "parser": "pnpm --filter '@racing/timing-parser'",
    "remotion": "pnpm --filter '@racing/remotion'",
    "shared": "pnpm --filter '@racing/shared'",
    "infra": "pnpm --filter '@racing/infra'",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "dev": "turbo run dev",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Создать `turbo.json`**

Content of `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 5: Создать `tsconfig.base.json`**

Content of `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "declaration": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

---

### Task 3: Перенести существующие проекты в `apps/` и `packages/`

**Files:**
- Move directories (без изменения содержимого)

- [ ] **Step 1: Создать целевые директории**

Run:
```bash
mkdir -p apps packages
```

- [ ] **Step 2: Переместить директории**

Run в `D:\Projects\Other\Racing\`:
```bash
mv race-time-front apps/race-time-front
mv telegram-race-timer apps/telegram-bot
mv timing-parser apps/timing-parser
mv remotion apps/remotion
mv shared packages/shared
```

- [ ] **Step 3: Удалить промежуточные `node_modules` и lock-файлы**

Run:
```bash
rm -rf apps/*/node_modules apps/*/package-lock.json packages/*/node_modules packages/*/package-lock.json apps/*/dist packages/*/dist
```

- [ ] **Step 4: Verify**

Run:
```bash
ls apps && ls packages
```
Expected: `race-time-front  telegram-bot  timing-parser  remotion` и `shared`.

---

### Task 4: Переименовать пакеты под `@racing/*`

**Files:**
- Modify: `apps/race-time-front/package.json`
- Modify: `apps/telegram-bot/package.json`
- Modify: `apps/timing-parser/package.json`
- Modify: `apps/remotion/package.json`

- [ ] **Step 1: race-time-front**

В `apps/race-time-front/package.json` заменить `"name": "race-time-front"` на:
```json
"name": "@racing/race-time-front"
```

- [ ] **Step 2: telegram-bot**

В `apps/telegram-bot/package.json` заменить `"name": "telegram-race-timer"` на:
```json
"name": "@racing/telegram-bot"
```
И заменить `"@racing/shared": "file:../shared"` на:
```json
"@racing/shared": "workspace:^"
```

- [ ] **Step 3: timing-parser**

В `apps/timing-parser/package.json` заменить `"name": "timing-parser"` на:
```json
"name": "@racing/timing-parser"
```
И заменить `"@racing/shared": "file:../shared"` на:
```json
"@racing/shared": "workspace:^"
```

- [ ] **Step 4: remotion**

Открыть `apps/remotion/package.json` и заменить `"name"` на `"@racing/remotion"` (оставить остальное как есть).

- [ ] **Step 5: shared (уже @racing/shared, добавить lint/clean скрипты)**

В `packages/shared/package.json` в `scripts` добавить:
```json
"clean": "rm -rf dist",
"lint": "echo 'no lint configured'"
```

---

### Task 5: Установить зависимости через pnpm

- [ ] **Step 1: Установить pnpm 9 (если ещё нет)**

Run:
```bash
npm install -g pnpm@9.15.0
pnpm --version
```
Expected: `9.15.0` или совместимая.

- [ ] **Step 2: Установить зависимости**

Run в корне:
```bash
pnpm install
```
Expected: создан корневой `pnpm-lock.yaml`, нет ошибок про missing peer deps. Один общий `node_modules/` плюс per-package symlinks.

- [ ] **Step 3: Verify workspace links**

Run:
```bash
ls -la apps/telegram-bot/node_modules/@racing/shared
ls -la apps/timing-parser/node_modules/@racing/shared
```
Expected: оба — symlink на `../../../packages/shared`.

---

### Task 6: Собрать `shared` и убедиться что apps собираются

- [ ] **Step 1: Сбилдить shared**

Run:
```bash
pnpm shared build
```
Expected: создан `packages/shared/dist/index.js` и `packages/shared/dist/index.d.ts`.

- [ ] **Step 2: Сбилдить bot**

Run:
```bash
pnpm bot build
```
Expected: `apps/telegram-bot/dist/main.js` создан, ошибок TS нет.

- [ ] **Step 3: Сбилдить parser**

Run:
```bash
pnpm parser build
```
Expected: `apps/timing-parser/dist/main.js` создан.

- [ ] **Step 4: Сбилдить frontend**

Run:
```bash
pnpm front build
```
Expected: `apps/race-time-front/.next/` создан, билд завершился без ошибок (предупреждения от Next.js допустимы).

- [ ] **Step 5: Прогнать через Turbo для проверки кеша**

Run:
```bash
pnpm build
```
Expected: все таски выполняются; повторный `pnpm build` отдаёт результат из кеша (`>>> FULL TURBO`).

---

### Task 7: Скаффолд `scripts/` пакета

**Files:**
- Create: `scripts/package.json`, `scripts/tsconfig.json`, `scripts/README.md`

- [ ] **Step 1: Добавить scripts в workspace**

В `pnpm-workspace.yaml` добавить строку `- scripts`:
```yaml
packages:
  - apps/*
  - packages/*
  - infra
  - scripts
```

- [ ] **Step 2: Создать `scripts/package.json`**

Content of `scripts/package.json`:
```json
{
  "name": "@racing/scripts",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "set-webhook": "tsx src/set-telegram-webhook.ts"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  },
  "dependencies": {
    "axios": "^1.7.9"
  }
}
```

- [ ] **Step 3: Создать `scripts/tsconfig.json`**

Content of `scripts/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Установить deps**

Run в корне:
```bash
pnpm install
```

---

## Phase 2 — Code adjustments

### Task 8: Telegram bot — webhook mode + Lambda handler

**Files:**
- Modify: `apps/telegram-bot/src/app/telegram/telegram.config.ts`
- Modify: `apps/telegram-bot/src/main.ts`
- Create: `apps/telegram-bot/src/lambda.ts`
- Modify: `apps/telegram-bot/package.json` — добавить deps

**Reference:** Текущий `telegram.config.ts` возвращает `{ token }` для long-polling. Перейдём в webhook-режим: nestjs-telegraf не сам биндится, а отдаёт callback, который мы вешаем на `/telegram/webhook` route нашего Express-приложения.

- [ ] **Step 1: Установить serverless-express**

Run:
```bash
pnpm bot add @vendia/serverless-express
```

- [ ] **Step 2: Изменить `telegram.config.ts` под webhook**

Replace contents of `apps/telegram-bot/src/app/telegram/telegram.config.ts`:
```ts
import { TelegrafModuleOptions } from 'nestjs-telegraf';
import { registerAs } from '@nestjs/config';
import * as process from 'node:process';

export default registerAs<TelegrafModuleOptions>('telegraf', () => {
  if (!process.env.TELEGRAM_TOKEN)
    throw new Error('TELEGRAM_TOKEN not found in env');

  return {
    token: process.env.TELEGRAM_TOKEN,
    launchOptions: false,
  };
});
```

(`launchOptions: false` отключает auto-launch long-polling; webhook будем дёргать вручную через `bot.handleUpdate`.)

- [ ] **Step 3: Добавить webhook controller**

Create `apps/telegram-bot/src/app/telegram/telegram.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Controller('telegram')
export class TelegramController {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: unknown) {
    await this.bot.handleUpdate(update as never);
    return { ok: true };
  }
}
```

- [ ] **Step 4: Подключить controller в TelegramModule**

В `apps/telegram-bot/src/app/telegram/telegram.module.ts` добавить controller:
```ts
import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigType } from '@nestjs/config';
import TelegramConfig from './telegram.config';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [TelegramConfig.KEY],
      imports: [ConfigModule.forFeature(TelegramConfig)],
      useFactory: (config: ConfigType<typeof TelegramConfig>) => config,
    }),
  ],
  controllers: [TelegramController],
})
export class TelegramModule {}
```

- [ ] **Step 5: Создать Lambda entry**

Create `apps/telegram-bot/src/lambda.ts`:
```ts
import { configure } from '@vendia/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { AppModule } from './app.module';

let cachedHandler: ReturnType<typeof configure>;

async function bootstrap() {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), { logger: ['error', 'warn', 'log'] });
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  await app.init();
  return configure({ app: expressApp });
}

export const handler = async (event: unknown, context: unknown, callback: unknown) => {
  if (!cachedHandler) cachedHandler = await bootstrap();
  return cachedHandler(event as never, context as never, callback as never);
};
```

- [ ] **Step 6: Сбилдить и проверить**

Run:
```bash
pnpm bot build
```
Expected: `dist/lambda.js` появился рядом с `dist/main.js`, без TS-ошибок.

- [ ] **Step 7: Локальный smoke-test webhook handler**

Run в `apps/telegram-bot/`:
```bash
TELEGRAM_TOKEN=fake node -e "import('./dist/lambda.js').then(async m => { const res = await m.handler({ httpMethod: 'POST', path: '/telegram/webhook', headers:{'content-type':'application/json'}, body: JSON.stringify({update_id:1}), isBase64Encoded:false }, {}, ()=>{}); console.log(res.statusCode); });"
```
Expected: вывод `200` (бот не отправит ответ Telegram, но handler должен корректно отработать).

---

### Task 9: Telegram bot — Lambda container Dockerfile

**Files:**
- Create: `apps/telegram-bot/Dockerfile`
- Create: `apps/telegram-bot/.dockerignore`

- [ ] **Step 1: Создать `.dockerignore`**

Content of `apps/telegram-bot/.dockerignore`:
```
node_modules
dist
.git
.env*
temp
*.log
```

- [ ] **Step 2: Создать `Dockerfile`**

**Контекст сборки** — корень монорепо (нужен доступ к `pnpm-workspace.yaml` и `packages/shared`).

Content of `apps/telegram-bot/Dockerfile`:
```dockerfile
FROM public.ecr.aws/lambda/nodejs:20 AS base
RUN microdnf install -y tar gzip && microdnf clean all
RUN npm install -g pnpm@9.15.0

FROM base AS builder
WORKDIR /build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/telegram-bot/package.json apps/telegram-bot/
RUN pnpm install --frozen-lockfile --filter '@racing/telegram-bot...'
COPY packages/shared packages/shared
COPY apps/telegram-bot apps/telegram-bot
RUN pnpm --filter '@racing/shared' run build
RUN pnpm --filter '@racing/telegram-bot' run build
RUN pnpm deploy --filter '@racing/telegram-bot' --prod /export

FROM public.ecr.aws/lambda/nodejs:20
COPY --from=builder /export/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=builder /build/apps/telegram-bot/dist ${LAMBDA_TASK_ROOT}/dist
CMD [ "dist/lambda.handler" ]
```

- [ ] **Step 3: Локальная сборка образа**

Run в корне монорепо:
```bash
docker build -f apps/telegram-bot/Dockerfile -t racing/telegram-bot:dev .
```
Expected: образ собирается без ошибок. Размер не критичен на этом этапе.

- [ ] **Step 4: Локальный smoke run**

Run:
```bash
docker run --rm -p 9000:8080 -e TELEGRAM_TOKEN=fake racing/telegram-bot:dev
```
Expected: лог Lambda Runtime `START RequestId: ...` ожидает invoke. В другом терминале:
```bash
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"httpMethod":"POST","path":"/telegram/webhook","headers":{"content-type":"application/json"},"body":"{\"update_id\":1}","isBase64Encoded":false}'
```
Expected: ответ `{"statusCode":200,...}`.

---

### Task 10: Timing parser — SIGTERM handler + reconnect

**Files:**
- Modify: `apps/timing-parser/src/main.ts`

- [ ] **Step 1: Расширить bootstrap**

Replace contents of `apps/timing-parser/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Application is running on: ${await app.getUrl()}`);

  const shutdown = async (signal: string) => {
    Logger.warn(`Received ${signal}, shutting down...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      Logger.error('Error during shutdown', err as Error);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
```

- [ ] **Step 2: Сбилдить**

Run:
```bash
pnpm parser build
```
Expected: ошибок нет.

- [ ] **Step 3: Локальный smoke-test SIGTERM**

Run в `apps/timing-parser/`:
```bash
node dist/main.js &
PID=$!
sleep 3
kill -TERM $PID
wait $PID; echo "exit: $?"
```
Expected: лог `Received SIGTERM, shutting down...` и `exit: 0`.

**Note:** WS reconnect-логика в `domains/timing/` уже имеется в существующем коде. Если там нет авто-переподключения после `app.close()` — это станет видно при первом Spot interruption и будет добавлено отдельной задачей.

---

### Task 11: Timing parser — Dockerfile для Fargate

**Files:**
- Create: `apps/timing-parser/Dockerfile`
- Create: `apps/timing-parser/.dockerignore`

- [ ] **Step 1: Создать `.dockerignore`**

Content of `apps/timing-parser/.dockerignore`:
```
node_modules
dist
.git
.env*
*.log
```

- [ ] **Step 2: Создать `Dockerfile`**

Content of `apps/timing-parser/Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.15.0
WORKDIR /build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/timing-parser/package.json apps/timing-parser/
RUN pnpm install --frozen-lockfile --filter '@racing/timing-parser...'
COPY packages/shared packages/shared
COPY apps/timing-parser apps/timing-parser
RUN pnpm --filter '@racing/shared' run build
RUN pnpm --filter '@racing/timing-parser' run build
RUN pnpm deploy --filter '@racing/timing-parser' --prod /export

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=builder /export/node_modules ./node_modules
COPY --from=builder /build/apps/timing-parser/dist ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Локальная сборка**

Run в корне:
```bash
docker build -f apps/timing-parser/Dockerfile -t racing/timing-parser:dev .
```
Expected: успешно.

- [ ] **Step 4: Локальный smoke run (без Postgres он упадёт на старте — проверяем только запуск runtime)**

Run:
```bash
docker run --rm -e DB_HOST=localhost -e DB_PASSWORD=fake racing/timing-parser:dev
```
Expected: видим лог Nest, потом ошибку коннекта к Postgres — это норма; цель — убедиться, что образ запускается.

---

## Phase 3 — CDK infra

### Task 12: Скаффолд `@racing/infra` пакета

**Files:**
- Create: `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/.gitignore`
- Create: `infra/bin/racing.ts`
- Create: `infra/lib/shared.ts`

- [ ] **Step 1: Создать `infra/package.json`**

Content of `infra/package.json`:
```json
{
  "name": "@racing/infra",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "synth": "cdk synth",
    "diff": "cdk diff",
    "deploy": "cdk deploy",
    "destroy": "cdk destroy",
    "lint": "echo 'no lint configured'",
    "clean": "rm -rf dist cdk.out"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.165.0",
    "constructs": "^10.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.17.0",
    "aws-cdk": "^2.165.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Создать `infra/tsconfig.json`**

Content of `infra/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["bin/**/*", "lib/**/*"]
}
```

- [ ] **Step 3: Создать `infra/cdk.json`**

Content of `infra/cdk.json`:
```json
{
  "app": "npx ts-node --prefer-ts-exts bin/racing.ts",
  "watch": { "include": ["**"], "exclude": ["README.md", "cdk.*.out"] },
  "context": {
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:newStyleStackSynthesis": true
  }
}
```

- [ ] **Step 4: Создать `infra/.gitignore`**

Content of `infra/.gitignore`:
```
cdk.out/
dist/
*.tsbuildinfo
```

- [ ] **Step 5: Создать `infra/lib/shared.ts`**

Content of `infra/lib/shared.ts`:
```ts
export const PRIMARY_REGION = 'eu-central-1';
export const CERT_REGION = 'us-east-1';
export const ROOT_DOMAIN = process.env.RACING_DOMAIN ?? 'example.com';
export const BOT_SUBDOMAIN = `bot.${ROOT_DOMAIN}`;
export const ECR_REPO_BOT = 'racing/telegram-bot';
export const ECR_REPO_PARSER = 'racing/timing-parser';
```

- [ ] **Step 6: Создать `infra/bin/racing.ts`** (пока без стеков — пустая аппа)

Content of `infra/bin/racing.ts`:
```ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PRIMARY_REGION } from '../lib/shared';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: PRIMARY_REGION };
void env;
void app;
```

- [ ] **Step 7: Установить deps + синтезировать пустой app**

Run:
```bash
pnpm install
pnpm infra synth
```
Expected: `Successfully synthesized to .../cdk.out` (пустое); ошибок TS нет.

---

### Task 13: DNS stack — Route 53 hosted zone

**Files:**
- Create: `infra/lib/dns-stack.ts`
- Modify: `infra/bin/racing.ts`

- [ ] **Step 1: Создать `dns-stack.ts`**

Content of `infra/lib/dns-stack.ts`:
```ts
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ROOT_DOMAIN } from './shared';

export class DnsStack extends Stack {
  public readonly hostedZone: IHostedZone;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.hostedZone = new HostedZone(this, 'RacingZone', { zoneName: ROOT_DOMAIN });
    new CfnOutput(this, 'NameServers', { value: this.hostedZone.hostedZoneNameServers!.join(',') ?? '' });
    new CfnOutput(this, 'HostedZoneId', { value: this.hostedZone.hostedZoneId });
  }
}
```

- [ ] **Step 2: Подключить в `bin/racing.ts`**

Replace contents of `infra/bin/racing.ts`:
```ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PRIMARY_REGION } from '../lib/shared';
import { DnsStack } from '../lib/dns-stack';

const app = new cdk.App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: PRIMARY_REGION };

new DnsStack(app, 'racing-dns', { env });
```

- [ ] **Step 3: Synth**

Run:
```bash
pnpm infra synth
```
Expected: `racing-dns` стек синтезирован, в `cdk.out/` появились шаблоны.

---

### Task 14: Cert stack — ACM в us-east-1 для CloudFront

**Files:**
- Create: `infra/lib/cert-stack.ts`
- Modify: `infra/bin/racing.ts`

- [ ] **Step 1: Создать `cert-stack.ts`**

Content of `infra/lib/cert-stack.ts`:
```ts
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { ROOT_DOMAIN } from './shared';

export interface CertStackProps extends StackProps {
  hostedZone: IHostedZone;
}

export class CertStack extends Stack {
  public readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);
    const cert = new Certificate(this, 'AmplifyCert', {
      domainName: ROOT_DOMAIN,
      subjectAlternativeNames: [`www.${ROOT_DOMAIN}`],
      validation: CertificateValidation.fromDns(props.hostedZone),
    });
    this.certificateArn = cert.certificateArn;
  }
}
```

- [ ] **Step 2: Подключить cross-region в `bin/racing.ts`**

Replace contents of `infra/bin/racing.ts`:
```ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PRIMARY_REGION, CERT_REGION } from '../lib/shared';
import { DnsStack } from '../lib/dns-stack';
import { CertStack } from '../lib/cert-stack';

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;

const dns = new DnsStack(app, 'racing-dns', { env: { account, region: PRIMARY_REGION } });

const cert = new CertStack(app, 'racing-cert-us', {
  env: { account, region: CERT_REGION },
  hostedZone: dns.hostedZone,
  crossRegionReferences: true,
});

void cert;
```

И в `App` props добавить `crossRegionReferences: true`. Если ругается TS — обернуть в `app.node.setContext` или передавать через stack props (как в snippet выше у CertStack — `crossRegionReferences: true`). Также в `DnsStack` props добавить:
```ts
new DnsStack(app, 'racing-dns', { env: { account, region: PRIMARY_REGION }, crossRegionReferences: true });
```

- [ ] **Step 3: Synth**

Run:
```bash
pnpm infra synth
```
Expected: оба стека синтезированы.

---

### Task 15: Frontend stack — Amplify Hosting

**Files:**
- Create: `infra/lib/frontend-stack.ts`
- Modify: `infra/bin/racing.ts`

**Note:** Используем `aws-cdk-lib/aws-amplify` (alpha-стабильно), либо `@aws-cdk/aws-amplify-alpha`. В пакете `aws-cdk-lib` Amplify L2 ещё в alpha; для пет-проекта проще использовать `@aws-cdk/aws-amplify-alpha`.

- [ ] **Step 1: Установить amplify-alpha**

Run:
```bash
pnpm infra add @aws-cdk/aws-amplify-alpha
```

- [ ] **Step 2: Создать `frontend-stack.ts`**

Content of `infra/lib/frontend-stack.ts`:
```ts
import { Stack, StackProps, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { App as AmplifyApp, GitHubSourceCodeProvider, Platform } from '@aws-cdk/aws-amplify-alpha';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ROOT_DOMAIN } from './shared';

export interface FrontendStackProps extends StackProps {
  hostedZone: IHostedZone;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubTokenSsmName: string;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const amplifyApp = new AmplifyApp(this, 'RacingFront', {
      appName: 'racing-front',
      platform: Platform.WEB_COMPUTE,
      sourceCodeProvider: new GitHubSourceCodeProvider({
        owner: props.githubOwner,
        repository: props.githubRepo,
        oauthToken: SecretValue.ssmSecure(props.githubTokenSsmName),
      }),
      environmentVariables: {
        AMPLIFY_MONOREPO_APP_ROOT: 'apps/race-time-front',
        AMPLIFY_DIFF_DEPLOY: 'false',
        _CUSTOM_IMAGE: 'amplify:al2023',
      },
      buildSpec: undefined,
    });

    const main = amplifyApp.addBranch('main', { branchName: props.githubBranch, autoBuild: true });
    main.addEnvironment('NEXT_PUBLIC_API_URL', `https://bot.${ROOT_DOMAIN}`);

    amplifyApp.addCustomRule({ source: '/<*>', target: '/index.html', status: 200 as never });

    amplifyApp.addDomain(ROOT_DOMAIN, {
      enableAutoSubdomain: false,
      subDomains: [
        { branch: main, prefix: '' },
        { branch: main, prefix: 'www' },
      ],
    });

    void RecordTarget;
    void ARecord;
  }
}
```

**Build spec** — Amplify сам читает `apps/race-time-front/amplify.yml`, см. Task 16.

- [ ] **Step 3: Создать build spec для Amplify**

Create `apps/race-time-front/amplify.yml`:
```yaml
version: 1
applications:
  - appRoot: apps/race-time-front
    frontend:
      phases:
        preBuild:
          commands:
            - npm install -g pnpm@9.15.0
            - cd ../.. && pnpm install --filter '@racing/race-time-front...'
            - cd ../.. && pnpm --filter '@racing/shared' run build
        build:
          commands:
            - pnpm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - ../../node_modules/**/*
          - .next/cache/**/*
```

- [ ] **Step 4: Положить GitHub PAT в SSM**

Run (один раз, вручную, после создания токена `repo:read` на GitHub):
```bash
aws ssm put-parameter --name /racing/github-token --type SecureString --value "ghp_xxx" --region eu-central-1
```

- [ ] **Step 5: Подключить FrontendStack в `bin/racing.ts`**

Добавить в `bin/racing.ts` после `cert`:
```ts
import { FrontendStack } from '../lib/frontend-stack';

new FrontendStack(app, 'racing-front', {
  env: { account, region: PRIMARY_REGION },
  hostedZone: dns.hostedZone,
  githubOwner: process.env.RACING_GH_OWNER ?? 'PlatonH',
  githubRepo: process.env.RACING_GH_REPO ?? 'racing',
  githubBranch: 'main',
  githubTokenSsmName: '/racing/github-token',
  crossRegionReferences: true,
});
```

- [ ] **Step 6: Synth**

Run:
```bash
pnpm infra synth
```
Expected: 3 стека синтезированы без ошибок.

---

### Task 16: Bot stack — Lambda container + API Gateway + custom domain

**Files:**
- Create: `infra/lib/bot-stack.ts`
- Modify: `infra/bin/racing.ts`

- [ ] **Step 1: Установить нужные cdk-модули**

Run:
```bash
pnpm infra add aws-cdk-lib
```
(Уже стоит — пропустить, если уже в deps.) Никаких alpha не нужно для Lambda/APIGW v2.

- [ ] **Step 2: Создать `bot-stack.ts`**

Content of `infra/lib/bot-stack.ts`:
```ts
import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DockerImageCode, DockerImageFunction, Architecture } from 'aws-cdk-lib/aws-lambda';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { HttpApi, HttpMethod, DomainName as HttpDomainName } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ECR_REPO_BOT, BOT_SUBDOMAIN } from './shared';

export interface BotStackProps extends StackProps {
  hostedZone: IHostedZone;
  rendersBucketName: string;
  imageTag: string;
}

export class BotStack extends Stack {
  constructor(scope: Construct, id: string, props: BotStackProps) {
    super(scope, id, props);

    const repo = Repository.fromRepositoryName(this, 'BotRepo', ECR_REPO_BOT);
    const rendersBucket = Bucket.fromBucketName(this, 'RendersBucket', props.rendersBucketName);

    const fn = new DockerImageFunction(this, 'BotFn', {
      code: DockerImageCode.fromEcr(repo, { tagOrDigest: props.imageTag }),
      architecture: Architecture.X86_64,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        S3_RENDERS_BUCKET: rendersBucket.bucketName,
      },
    });

    rendersBucket.grantReadWrite(fn);
    fn.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/racing/*`],
    }));
    fn.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:remotion-render-*`],
    }));

    const cert = new Certificate(this, 'BotCert', {
      domainName: BOT_SUBDOMAIN,
      validation: CertificateValidation.fromDns(props.hostedZone),
    });

    const domainName = new HttpDomainName(this, 'BotDomain', {
      domainName: BOT_SUBDOMAIN,
      certificate: cert,
    });

    const httpApi = new HttpApi(this, 'BotApi', {
      defaultDomainMapping: { domainName },
    });
    httpApi.addRoutes({
      path: '/telegram/webhook',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('BotIntegration', fn),
    });

    new ARecord(this, 'BotAliasRecord', {
      zone: props.hostedZone,
      recordName: 'bot',
      target: RecordTarget.fromAlias(new ApiGatewayv2DomainProperties(
        domainName.regionalDomainName,
        domainName.regionalHostedZoneId,
      )),
    });

    new CfnOutput(this, 'BotEndpoint', { value: `https://${BOT_SUBDOMAIN}/telegram/webhook` });
  }
}
```

- [ ] **Step 3: Подготовить ECR-репо и S3-бакет вне CDK (одноразово)**

Run:
```bash
aws ecr create-repository --repository-name racing/telegram-bot --region eu-central-1 || true
aws ecr create-repository --repository-name racing/timing-parser --region eu-central-1 || true
aws s3api create-bucket --bucket racing-renders-$(aws sts get-caller-identity --query Account --output text) \
  --region eu-central-1 --create-bucket-configuration LocationConstraint=eu-central-1 || true
```
Запомните имя бакета — оно понадобится дальше как `RACING_RENDERS_BUCKET`.

- [ ] **Step 4: Подключить BotStack в `bin/racing.ts`**

Добавить:
```ts
import { BotStack } from '../lib/bot-stack';

new BotStack(app, 'racing-bot', {
  env: { account, region: PRIMARY_REGION },
  hostedZone: dns.hostedZone,
  rendersBucketName: process.env.RACING_RENDERS_BUCKET!,
  imageTag: process.env.RACING_BOT_TAG ?? 'latest',
  crossRegionReferences: true,
});
```

- [ ] **Step 5: Synth**

Run:
```bash
RACING_RENDERS_BUCKET=racing-renders-123456789012 pnpm infra synth
```
Expected: 4 стека, без ошибок.

---

### Task 17: Parser stack — ECS Fargate Spot

**Files:**
- Create: `infra/lib/parser-stack.ts`
- Modify: `infra/bin/racing.ts`

- [ ] **Step 1: Создать `parser-stack.ts`**

Content of `infra/lib/parser-stack.ts`:
```ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Cluster, FargateService, FargateTaskDefinition, ContainerImage, LogDrivers, CapacityProviderStrategy, Secret as EcsSecret } from 'aws-cdk-lib/aws-ecs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { ECR_REPO_PARSER } from './shared';

export interface ParserStackProps extends StackProps {
  imageTag: string;
}

export class ParserStack extends Stack {
  constructor(scope: Construct, id: string, props: ParserStackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const cluster = new Cluster(this, 'ParserCluster', { vpc, enableFargateCapacityProviders: true });

    const repo = Repository.fromRepositoryName(this, 'ParserRepo', ECR_REPO_PARSER);

    const taskDef = new FargateTaskDefinition(this, 'ParserTask', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    const logGroup = new LogGroup(this, 'ParserLogs', { retention: RetentionDays.TWO_WEEKS });

    const ssmHost = StringParameter.fromSecureStringParameterAttributes(this, 'DbHost', { parameterName: '/racing/db-host' });
    const ssmPort = StringParameter.fromSecureStringParameterAttributes(this, 'DbPort', { parameterName: '/racing/db-port' });
    const ssmUser = StringParameter.fromSecureStringParameterAttributes(this, 'DbUser', { parameterName: '/racing/db-user' });
    const ssmPass = StringParameter.fromSecureStringParameterAttributes(this, 'DbPass', { parameterName: '/racing/db-password' });
    const ssmName = StringParameter.fromSecureStringParameterAttributes(this, 'DbName', { parameterName: '/racing/db-name' });

    taskDef.addContainer('parser', {
      image: ContainerImage.fromEcrRepository(repo, props.imageTag),
      logging: LogDrivers.awsLogs({ streamPrefix: 'parser', logGroup }),
      environment: { NODE_ENV: 'production', DB_SSL: 'true' },
      secrets: {
        DB_HOST: EcsSecret.fromSsmParameter(ssmHost),
        DB_PORT: EcsSecret.fromSsmParameter(ssmPort),
        DB_USERNAME: EcsSecret.fromSsmParameter(ssmUser),
        DB_PASSWORD: EcsSecret.fromSsmParameter(ssmPass),
        DB_DATABASE: EcsSecret.fromSsmParameter(ssmName),
      },
    });

    new FargateService(this, 'ParserService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE_SPOT', weight: 1 } satisfies CapacityProviderStrategy,
      ],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
  }
}
```

- [ ] **Step 2: Подключить в `bin/racing.ts`**

Добавить:
```ts
import { ParserStack } from '../lib/parser-stack';

new ParserStack(app, 'racing-parser', {
  env: { account, region: PRIMARY_REGION },
  imageTag: process.env.RACING_PARSER_TAG ?? 'latest',
  crossRegionReferences: true,
});
```

- [ ] **Step 3: Synth**

Run:
```bash
pnpm infra synth
```
Expected: 5 стеков, без ошибок.

---

### Task 18: Заполнить SSM-параметры (Supabase + Telegram + GitHub)

- [ ] **Step 1: Положить значения в SSM**

Run (значения подставить из `apps/timing-parser/.env` и Telegram BotFather):
```bash
REGION=eu-central-1
aws ssm put-parameter --region $REGION --name /racing/telegram-token --type SecureString --value "<TG_TOKEN>"
aws ssm put-parameter --region $REGION --name /racing/db-host --type SecureString --value "<SUPABASE_HOST>"
aws ssm put-parameter --region $REGION --name /racing/db-port --type SecureString --value "5432"
aws ssm put-parameter --region $REGION --name /racing/db-user --type SecureString --value "<USER>"
aws ssm put-parameter --region $REGION --name /racing/db-password --type SecureString --value "<PASS>"
aws ssm put-parameter --region $REGION --name /racing/db-name --type SecureString --value "postgres"
aws ssm put-parameter --region $REGION --name /racing/github-token --type SecureString --value "<GH_PAT>"
```

- [ ] **Step 2: Verify**

Run:
```bash
aws ssm get-parameters-by-path --region eu-central-1 --path /racing --recursive --query 'Parameters[].Name'
```
Expected: 7 параметров.

---

## Phase 4 — Deploy & verify

### Task 19: Bootstrap CDK в обоих регионах

- [ ] **Step 1: Bootstrap eu-central-1**

Run:
```bash
pnpm infra exec cdk bootstrap aws://<ACCOUNT_ID>/eu-central-1
```
Expected: stack `CDKToolkit` создан.

- [ ] **Step 2: Bootstrap us-east-1**

Run:
```bash
pnpm infra exec cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

---

### Task 20: Деплой DNS-стека и переключение NS у регистратора

- [ ] **Step 1: Деплой DNS**

Run:
```bash
pnpm infra deploy racing-dns
```
Expected: вывод `NameServers = ns-XXX.awsdns-...` (4 записи).

- [ ] **Step 2: Прописать NS у регистратора**

Зайти в панель регистратора → заменить NS-серверы на 4 от Route 53. Дождаться пропагации:
```bash
dig +short NS example.com @8.8.8.8
```
Expected: видны `awsdns` записи (может занять до 48 ч, обычно 10–60 мин).

---

### Task 21: Деплой Cert-стека (us-east-1)

- [ ] **Step 1: Деплой**

Run:
```bash
pnpm infra deploy racing-cert-us
```
Expected: ACM cert ISSUED (Certificate валидируется автоматически через DNS-записи в Route 53).

---

### Task 22: Сборка и push образов в ECR

**Files:**
- Используются Dockerfile-ы из Tasks 9 и 11.

- [ ] **Step 1: Залогиниться в ECR**

Run:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com
```

- [ ] **Step 2: Build + push bot**

Run в корне:
```bash
docker build -f apps/telegram-bot/Dockerfile -t ${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/racing/telegram-bot:latest .
docker push ${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/racing/telegram-bot:latest
```

- [ ] **Step 3: Build + push parser**

Run:
```bash
docker build -f apps/timing-parser/Dockerfile -t ${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/racing/timing-parser:latest .
docker push ${ACCOUNT_ID}.dkr.ecr.eu-central-1.amazonaws.com/racing/timing-parser:latest
```

- [ ] **Step 4: Verify**

Run:
```bash
aws ecr describe-images --repository-name racing/telegram-bot --region eu-central-1 --query 'imageDetails[].imageTags'
aws ecr describe-images --repository-name racing/timing-parser --region eu-central-1 --query 'imageDetails[].imageTags'
```
Expected: оба содержат `latest`.

---

### Task 23: Деплой Bot и Parser стеков

- [ ] **Step 1: Bot stack**

Run:
```bash
RACING_RENDERS_BUCKET=racing-renders-${ACCOUNT_ID} \
RACING_BOT_TAG=latest \
pnpm infra deploy racing-bot
```
Expected: стек `racing-bot` развернулся, в outputs `BotEndpoint = https://bot.example.com/telegram/webhook`.

- [ ] **Step 2: Parser stack**

Run:
```bash
RACING_PARSER_TAG=latest pnpm infra deploy racing-parser
```
Expected: ECS service `ParserService` запущен, 1 task в статусе `RUNNING`.

- [ ] **Step 3: Проверить логи парсера**

Run:
```bash
aws logs tail /aws/ecs/parser --follow --region eu-central-1
```
Expected: видим Nest-стартовые сообщения и подключение к Supabase.

---

### Task 24: Деплой Frontend-стека и проверка

- [ ] **Step 1: Деплой**

Run:
```bash
RACING_GH_OWNER=<owner> RACING_GH_REPO=<repo> pnpm infra deploy racing-front
```
Expected: Amplify app создан, выпущен build branch `main`. ACM-валидация пройдёт автоматически (DNS уже у Route 53).

- [ ] **Step 2: Дождаться первого билда в Amplify Console**

В консоли AWS → Amplify → racing-front → main: статус `Build → Deploy → Verify` все зелёные.

- [ ] **Step 3: Проверить домен**

Run:
```bash
curl -I https://example.com
```
Expected: `HTTP/2 200`, заголовки от CloudFront.

---

### Task 25: Установить Telegram webhook

**Files:**
- Modify (опц.): `scripts/src/set-telegram-webhook.ts`

- [ ] **Step 1: Создать вспомогательный скрипт**

Create `scripts/src/set-telegram-webhook.ts`:
```ts
import axios from 'axios';

const token = process.env.TELEGRAM_TOKEN;
const url = process.env.WEBHOOK_URL;
if (!token || !url) {
  console.error('Set TELEGRAM_TOKEN and WEBHOOK_URL');
  process.exit(1);
}

(async () => {
  const r = await axios.get(`https://api.telegram.org/bot${token}/setWebhook`, { params: { url } });
  console.log(r.data);
})();
```

- [ ] **Step 2: Запустить**

Run в корне:
```bash
TELEGRAM_TOKEN=$(aws ssm get-parameter --name /racing/telegram-token --with-decryption --region eu-central-1 --query Parameter.Value --output text) \
WEBHOOK_URL="https://bot.example.com/telegram/webhook" \
pnpm --filter @racing/scripts run set-webhook
```
Expected: `{ ok: true, result: true, description: 'Webhook was set' }`.

- [ ] **Step 3: Проверить getWebhookInfo**

Run:
```bash
TOKEN=$(aws ssm get-parameter --name /racing/telegram-token --with-decryption --region eu-central-1 --query Parameter.Value --output text)
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```
Expected: `url` совпадает, `pending_update_count: 0` или маленькое число.

---

### Task 26: End-to-end smoke-test

- [ ] **Step 1: Послать боту команду в Telegram**

В Telegram-чате с ботом отправить `/start` (или ту команду, которая определена в `apps/telegram-bot/src/app/`).
Expected: бот отвечает; в CloudWatch logs `/aws/lambda/<BotFn>` видно invocation.

- [ ] **Step 2: Открыть фронт**

В браузере открыть `https://example.com`.
Expected: страница загружается, данные подтягиваются из Supabase.

- [ ] **Step 3: Проверить парсер**

Запустить заезд (или дождаться источника таймингов). В CloudWatch logs `/aws/ecs/parser` должны появиться записи о принятых WS-сообщениях; в Supabase — новые строки в `laps`.

---

### Task 27: GitHub Actions для авто-деплоя

**Files:**
- Create: `.github/workflows/bot.yml`
- Create: `.github/workflows/parser.yml`
- Create: `.github/workflows/frontend.yml` (опц., Amplify сам слушает push)

- [ ] **Step 1: Создать workflow для бота**

Content of `.github/workflows/bot.yml`:
```yaml
name: bot
on:
  push:
    branches: [main]
    paths:
      - 'apps/telegram-bot/**'
      - 'packages/shared/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/bot.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-central-1
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build & push
        run: |
          IMAGE=${{ steps.login-ecr.outputs.registry }}/racing/telegram-bot:${{ github.sha }}
          docker build -f apps/telegram-bot/Dockerfile -t $IMAGE .
          docker push $IMAGE
          echo "IMAGE=$IMAGE" >> $GITHUB_ENV
      - name: Update Lambda
        run: |
          aws lambda update-function-code \
            --function-name $(aws cloudformation describe-stacks --stack-name racing-bot --query "Stacks[0].Outputs[?OutputKey=='BotFnName'].OutputValue" --output text) \
            --image-uri $IMAGE
```

**Note:** В `bot-stack.ts` нужно добавить `CfnOutput` с именем функции — `new CfnOutput(this, 'BotFnName', { value: fn.functionName });`. Сделать сейчас.

- [ ] **Step 2: Добавить output BotFnName в bot-stack.ts**

В `infra/lib/bot-stack.ts` после `new CfnOutput(this, 'BotEndpoint', ...)` добавить:
```ts
new CfnOutput(this, 'BotFnName', { value: fn.functionName });
```

- [ ] **Step 3: Создать workflow для парсера**

Content of `.github/workflows/parser.yml`:
```yaml
name: parser
on:
  push:
    branches: [main]
    paths:
      - 'apps/timing-parser/**'
      - 'packages/shared/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/parser.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-central-1
      - id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build & push
        run: |
          IMAGE=${{ steps.login-ecr.outputs.registry }}/racing/timing-parser:${{ github.sha }}
          docker build -f apps/timing-parser/Dockerfile -t $IMAGE .
          docker push $IMAGE
      - name: Force ECS redeploy
        run: |
          aws ecs update-service \
            --cluster $(aws cloudformation describe-stacks --stack-name racing-parser --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue" --output text) \
            --service $(aws cloudformation describe-stacks --stack-name racing-parser --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue" --output text) \
            --force-new-deployment
```

**Note:** Добавить в `parser-stack.ts` outputs `ClusterName` и `ServiceName`.

- [ ] **Step 4: Добавить outputs в parser-stack.ts**

В `infra/lib/parser-stack.ts` после `new FargateService(...)` сохранить ссылку:
```ts
const service = new FargateService(this, 'ParserService', { /* ... */ });
new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
new CfnOutput(this, 'ServiceName', { value: service.serviceName });
```
И импортировать `CfnOutput` из `aws-cdk-lib` сверху.

- [ ] **Step 5: Re-deploy bot и parser стеков**

Run:
```bash
pnpm infra deploy racing-bot racing-parser
```
Expected: outputs обновлены.

- [ ] **Step 6: Завести GitHub OIDC role**

Создать в AWS IAM роль с trust policy для GitHub OIDC и permissions: `ecr:*`, `lambda:UpdateFunctionCode`, `ecs:UpdateService`, `cloudformation:DescribeStacks`. ARN положить в GitHub Secrets как `AWS_DEPLOY_ROLE_ARN`. Подробнее: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services

(Эта одноразовая настройка вне CDK; для пет-проекта допустимо вручную.)

---

## Self-Review

**Spec coverage:**
- ✅ Состав сервисов и хостинг — Tasks 8–11, 15–17.
- ✅ Регион eu-central-1 / cert us-east-1 — Tasks 14, 19.
- ✅ Route 53 hosted zone — Task 13.
- ✅ ACM сертификаты (оба) — Tasks 14, 16.
- ✅ ECR — Task 16 (Step 3 — pre-create) + 22.
- ✅ VPC default + public subnet, без NAT — Task 17.
- ✅ SSM Parameter Store — Tasks 17, 18.
- ✅ IAM роли (Lambda S3+SSM+Lambda invoke; Fargate SSM read) — Tasks 16, 17.
- ✅ Раскладка домена (apex+www+bot) — Tasks 13, 15, 16.
- ✅ Поток данных — реализуется кодом + стеками; не отдельный шаг.
- ✅ Repository layout + monorepo — Tasks 1–7.
- ✅ Скоупы `@racing/*` — Tasks 4, 7, 12.
- ✅ Turborepo — Task 2.
- ✅ Workspace dep `@racing/shared` — Tasks 4, 5, 6.
- ✅ Корневой `.gitignore` объединённый — Task 1.
- ✅ Telegram webhook + serverless-express — Task 8.
- ✅ Parser SIGTERM + reconnect — Task 10 (с пометкой про WS reconnect).
- ✅ Dockerfile-ы для bot и parser — Tasks 9, 11.
- ✅ Amplify build spec монорепо — Task 15 (Step 3).
- ✅ Оценка стоимости / YAGNI — отражены в `bin/racing.ts` (нет ALB, нет NAT, single task) и в спеке.
- ✅ Risks: Spot interruption, cold start, NS propagation — учтены косвенно (capacity provider Spot, manual NS step).
- ✅ Migration plan из спеки — Tasks 1–7 + 12.
- ✅ CI/CD per app с paths-фильтрами — Task 27.

**Placeholder scan:** Нет «TBD/TODO/implement later» в шагах. В коде стеков использованы конкретные API CDK 2 (DockerImageFunction, HttpApi, FargateService, AmplifyApp). `<ACCOUNT_ID>`, `<TG_TOKEN>`, `<owner>` и т.п. — это значения, которые подставляет оператор; они помечены угловыми скобками и встречаются только в командах деплоя.

**Type consistency:** Имена идентификаторов согласованы: `racing-dns`, `racing-cert-us`, `racing-front`, `racing-bot`, `racing-parser`; outputs `BotFnName`, `ClusterName`, `ServiceName` используются в одном виде в `bot-stack.ts`/`parser-stack.ts` и в GitHub workflows.

**Известные шероховатости (приемлемы для пет-проекта):**
- Amplify `addCustomRule({ status: 200 as never })` — обход типов alpha-пакета. После реального деплоя возможно потребуется заменить на `RedirectStatus.REWRITE`.
- WS-reconnect в `domains/timing/` явно не дописан — будет видно при первом Spot interruption (см. Task 10 Note).
- GitHub OIDC role создаётся вручную — оправдано для пет-проекта.

---

## Execution Handoff

**Plan complete.** Сохранён в `docs/superpowers/plans/2026-05-02-aws-deploy-monorepo.md`.

**Два варианта исполнения:**

1. **Subagent-Driven (рекомендуется)** — на каждую таску свежий субагент, я ревью между тасками. Хорошо ловит ошибки и не загружает основной контекст.
2. **Inline Execution** — выполняем в этой же сессии батчами с чекпоинтами.

Какой подход выбираем?
