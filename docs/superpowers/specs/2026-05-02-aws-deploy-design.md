# AWS Deploy + Monorepo Migration — Racing pet-project

## Цель

1. Развернуть три сервиса (Next.js фронт, Telegram-бот, WS-парсер таймингов) и Remotion-рендер в AWS по принципу config-as-code, с привязкой к собственному домену, при бюджете ~$5–10/мес.
2. Конвертировать репозиторий в pnpm-монорепозиторий по образцу `D:\Work\verybigmotion\big-motion`.

БД остаётся в Supabase.

## Состав сервисов и хостинг

| Сервис | Хостинг | Запуск | Inbound | Outbound |
|---|---|---|---|---|
| `@racing/race-time-front` | Amplify Hosting | по `git push` (SSR Next.js 15) | HTTPS | Supabase REST, собственный API |
| `@racing/telegram-bot` | Lambda (container image) + API Gateway HTTP API | webhook от Telegram | HTTPS | Telegram API, S3, Supabase, Remotion Lambda |
| `@racing/timing-parser` | ECS Fargate Spot (0.25 vCPU / 0.5 GB), 1 task, без ALB | always-on | — | WS к таймингеру, Supabase |
| `@racing/remotion` | Remotion Lambda | вызов из telegram-бота | — | S3 |
| Хранилище | S3 (renders, thumbnails) | — | — | — |

## Инфраструктурные ресурсы

- **Регион**: `eu-central-1` (Франкфурт). Cross-region ACM-сертификат для Amplify создаётся в `us-east-1`.
- **Route 53 hosted zone** для домена ($0.50/мес).
- **ACM сертификаты**: `eu-central-1` для API Gateway regional, `us-east-1` для CloudFront перед Amplify.
- **ECR** репозитории: `racing/telegram-bot`, `racing/timing-parser`.
- **VPC**: дефолтный VPC, публичные подсети, у Fargate task — public IP, **без NAT Gateway** (NAT ~$33/мес исключён намеренно).
- **SSM Parameter Store** (`SecureString`): токен Telegram, Supabase service role, ключи парсера. Дешевле Secrets Manager и достаточен для пет-проекта.
- **IAM роли**: Lambda execution role (S3 + Remotion invoke), Fargate task role (SSM read).

## Раскладка домена

```
example.com, www.example.com   → Amplify (frontend)
bot.example.com                → API Gateway → Lambda (Telegram webhook)
parser                         → DNS не требуется (только исходящий WS)
```

DNS-записи и сертификаты создаёт CDK-стек в Route 53.

После деплоя webhook у Telegram ставится одной командой:
```
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://bot.example.com/telegram/webhook"
```

## Поток данных

1. **Telegram** → `POST https://bot.example.com/telegram/webhook` → API Gateway → Lambda → бизнес-логика → S3 / Remotion Lambda / Supabase.
2. **Браузер** → `https://example.com` (Amplify SSR) → Supabase REST + API через `bot.example.com` (CORS-allow).
3. **Fargate task** поднимается, открывает WS к источнику таймингов, пишет лапы в Supabase напрямую.

## Repository layout (monorepo)

```
racing/
├─ apps/
│  ├─ race-time-front/        # Next.js → Amplify        (@racing/race-time-front)
│  ├─ telegram-bot/           # NestJS → Lambda          (@racing/telegram-bot)
│  ├─ timing-parser/          # NestJS → Fargate Spot    (@racing/timing-parser)
│  └─ remotion/               # Remotion Lambda renderer (@racing/remotion)
├─ packages/
│  └─ shared/                 # TypeORM entities, типы   (@racing/shared)
├─ infra/                     # AWS CDK                  (@racing/infra)
│  ├─ bin/racing.ts
│  ├─ lib/{network,frontend,bot,parser,dns}-stack.ts
│  └─ package.json
├─ docs/
├─ scripts/                   # одноразовые утилиты      (@racing/scripts)
├─ pnpm-workspace.yaml
├─ turbo.json
├─ package.json               # шорткаты + общие devDeps
├─ tsconfig.base.json
├─ .nvmrc                     # 20
├─ .github/workflows/
└─ .gitignore
```

**Скоуп**: единый `@racing/*` для apps, packages и infra.

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - apps/*
  - packages/*
  - infra
```

**Корневой `package.json`** (фрагмент):
```json
{
  "name": "@racing/monorepo",
  "private": true,
  "packageManager": "pnpm@9.x",
  "scripts": {
    "front":    "pnpm --filter '@racing/race-time-front'",
    "bot":      "pnpm --filter '@racing/telegram-bot'",
    "parser":   "pnpm --filter '@racing/timing-parser'",
    "remotion": "pnpm --filter '@racing/remotion'",
    "shared":   "pnpm --filter '@racing/shared'",
    "infra":    "pnpm --filter '@racing/infra'",
    "build":    "turbo run build",
    "lint":     "turbo run lint",
    "dev":      "turbo run dev"
  }
}
```

**`turbo.json`** (минимальный):
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "lint":  { "dependsOn": ["^build"] },
    "dev":   { "cache": false, "persistent": true }
  }
}
```

**Workspace-зависимость** заменит `file:../shared`:
```jsonc
// apps/timing-parser/package.json
"dependencies": { "@racing/shared": "workspace:^" }
```

## IaC structure

Один CDK-пакет `@racing/infra` (TypeScript):

```
infra/
├─ bin/racing.ts            # entrypoint
├─ lib/
│  ├─ dns-stack.ts          # Route 53 hosted zone, общие записи
│  ├─ frontend-stack.ts     # Amplify app + домен + ACM (us-east-1)
│  ├─ bot-stack.ts          # Lambda + API Gateway + custom domain
│  ├─ parser-stack.ts       # ECS cluster + Fargate Spot service + ECR
│  └─ shared.ts             # общие константы (region, домен)
├─ cdk.json
└─ package.json
```

Деплой: `pnpm infra cdk deploy --all`.

## CI/CD

- **Frontend**: Amplify подключён к репозиторию, авто-деплой по push в `main` (билд-команда: `pnpm install --filter '@racing/race-time-front...' && pnpm front build`).
- **Bot**: GitHub Actions → `docker build` (контекст — корень монорепо, `Dockerfile` в `apps/telegram-bot/`) → `aws ecr push` → `aws lambda update-function-code`.
- **Parser**: аналогичный workflow → push в ECR → `aws ecs update-service --force-new-deployment`.
- **Infra**: ручной `pnpm infra cdk deploy` локально (для пет-проекта достаточно; CI на CDK добавим позже при необходимости).
- **Triggering**: каждый workflow запускается по `paths:` фильтру на `apps/<name>/**` и `packages/shared/**`.

## Изменения в коде сервисов

- `telegram-bot`: переключить с `Telegraf.launch()` (long-polling) на webhook-режим (`telegram.setWebhook` + Express handler), обернуть Nest-приложение в Lambda через `@vendia/serverless-express`.
- `timing-parser`: добавить graceful reconnect и обработчик `SIGTERM` (Fargate Spot даёт ~2 мин предупреждения через task state change).
- Все сервисы: чтение секретов из env, env заполняется из SSM Parameter Store через стартовый скрипт (Lambda — через `@aws-sdk/client-ssm` в `bootstrap`, Fargate — через task definition `secrets`).
- Добавить `Dockerfile` в `apps/telegram-bot/` (Lambda container image, base `public.ecr.aws/lambda/nodejs:20`) и `apps/timing-parser/` (multi-stage Node 20). У `race-time-front/` уже есть Dockerfile — для Amplify он не нужен, можно оставить для локальной отладки.

## План миграции

1. **`git init`** в корне `D:\Projects\Other\Racing\`. Историю подпроектов не сохраняем (по согласованию). Существующий `.git` внутри `telegram-race-timer/` после переезда удаляется.
2. **Создать структуру**: `apps/`, `packages/`, `infra/`, `scripts/`. Перенести:
   - `race-time-front/` → `apps/race-time-front/`
   - `telegram-race-timer/` → `apps/telegram-bot/`
   - `timing-parser/` → `apps/timing-parser/`
   - `remotion/` → `apps/remotion/`
   - `shared/` → `packages/shared/`
   - `renders/`, `temp/` — в `.gitignore`, не в workspace.
3. **Переименовать пакеты** в `package.json` каждого приложения под `@racing/*`. Заменить `"@racing/shared": "file:../shared"` на `"@racing/shared": "workspace:^"`.
4. **Удалить** локальные `package-lock.json` и `node_modules/` во всех подпроектах. Создать корневые `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `.nvmrc` (`20`), `tsconfig.base.json`. Запустить `pnpm install` → один корневой `pnpm-lock.yaml`.
5. **Перенастроить `tsconfig`**: `tsconfig.base.json` с `paths` для воркспейс-импортов; в каждом app `extends` от base.
6. **Объединить `.gitignore`** в корневой; перенести оригинальные правила; добавить `**/node_modules`, `**/dist`, `**/.next`, `**/.turbo`, `renders/`, `temp/`, `apps/*/key.json`.
7. **Создать пакет `@racing/infra`** с CDK-скелетом (5 stacks). Деплой пока ничего реального не разворачивает — только создаёт VPC lookup и hosted zone.
8. **Прогнать smoke-build**: `pnpm build` (через Turbo) должен собрать все четыре приложения и `shared`.
9. **Завести `.github/workflows/`** с тремя workflow (frontend, bot, parser) и `paths`-фильтрами.
10. **Постепенный AWS-деплой**:
    - DNS-стек (hosted zone) → перевести NS у регистратора на Route 53 → дождаться валидации.
    - Frontend-стек → Amplify connect → проверить домен.
    - Bot-стек → деплой Lambda+API Gateway → переключить Telegram webhook → проверить.
    - Parser-стек → ECR push → Fargate Spot → проверить логи.

## Оценка стоимости (eu-central-1, пет-трафик)

| Статья | $/мес |
|---|---|
| Amplify Hosting (build + 100 GB transfer free tier) | ~$0 |
| Lambda (бот, 100k invocations) | <$0.20 |
| API Gateway HTTP API (100k requests) | ~$0.10 |
| Fargate Spot (0.25 vCPU, 0.5 GB, 24/7) | ~$3–4 |
| ECR storage (2 образа) | <$0.50 |
| S3 (рендеры, ~5 GB) | ~$0.15 |
| Route 53 hosted zone | $0.50 |
| Data transfer | ~$0.50 |
| **Итого** | **~$5–6** |

Remotion Lambda — pay-per-render, в простое $0.

## Что НЕ делаем (YAGNI)

- Ни ALB/NLB, ни NAT Gateway — фиксированные $16+$33/мес для пета не оправданы.
- Ни RDS — БД остаётся в Supabase.
- Ни CloudFront перед API — API Gateway сам по себе даёт TLS.
- Ни мульти-AZ/мульти-task — одного Fargate task достаточно.
- Ни WAF, ни X-Ray, ни CloudWatch alarms сверх минимальных.
- Ни git subtree для сохранения истории подпроектов — начинаем с чистого `git init`.
- Ни Lerna/Nx — pnpm workspaces + Turborepo достаточны.
- Ни per-app `infra/` — один корневой `infra/` (отличие от big-motion, упрощение для пета).
- Ни CI на CDK-деплой — ручной `cdk deploy` с локальной машины.

## Риски

- **Spot interruption у парсера** — ~раз в день максимум; ECS перезапустит task за 30–60 сек. Если потеря данных за этот промежуток критична — переходим на on-demand Fargate (+$3/мес).
- **Холодный старт Lambda для бота** — первый ответ 1–2 сек. Для ручных команд приемлемо. Если понадобится мгновенно — Provisioned Concurrency (+$) или переезд бота на тот же Fargate.
- **Lambda 15-минутный лимит** — не задевает: Remotion-рендер сам себе Lambda, бот только инициирует.
- **Миграция NS на Route 53** — пока DNS пропагируется (до 48 ч), домен может «моргать». Деплой DNS-стека — первый шаг, чтобы успело пропагироваться к моменту подключения Amplify/API Gateway.
- **Сборка `shared` при изменениях** — Turbo по умолчанию закеширует `dist/`. Apps должны импортировать из `@racing/shared` (артефакт), а не из `src` — иначе Next.js/Nest будут жаловаться на TS вне своих rootDir.
