FROM public.ecr.aws/lambda/nodejs:20 AS base
RUN microdnf install -y tar gzip && microdnf clean all
RUN npm install -g pnpm@10.28.1

FROM base AS builder
WORKDIR /build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/telegram-bot/package.json apps/telegram-bot/
COPY apps/race-time-front/package.json apps/race-time-front/
COPY apps/timing-parser/package.json apps/timing-parser/
COPY apps/remotion/package.json apps/remotion/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/shared packages/shared
COPY apps/telegram-bot apps/telegram-bot
RUN pnpm --filter @racing/shared run build
RUN pnpm --filter @racing/telegram-bot run build
RUN pnpm deploy --filter @racing/telegram-bot --prod --legacy /export

FROM public.ecr.aws/lambda/nodejs:20
COPY --from=builder /export/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=builder /build/apps/telegram-bot/dist ${LAMBDA_TASK_ROOT}/dist
CMD [ "dist/lambda.handler" ]
