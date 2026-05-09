FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

FROM base AS builder
WORKDIR /build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/telegram-bot/package.json apps/telegram-bot/
COPY apps/frontend/package.json apps/frontend/
COPY apps/timing-parser/package.json apps/timing-parser/
COPY apps/remotion/package.json apps/remotion/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/shared packages/shared
COPY apps/timing-parser apps/timing-parser
RUN pnpm --filter @racing/shared run build
RUN pnpm --filter @racing/timing-parser run build
RUN pnpm deploy --filter @racing/timing-parser --prod --legacy /export

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /export/node_modules ./node_modules
COPY --from=builder /build/apps/timing-parser/dist ./dist
USER node
CMD ["node", "dist/main.js"]
