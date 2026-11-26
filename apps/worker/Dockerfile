# ────────────────────────────────────────────────────────────────
# Stage 1 : Builder
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Copier le schéma Prisma AVANT pnpm install (postinstall de apps/api)
COPY apps/api/prisma apps/api/prisma

RUN pnpm install --frozen-lockfile --shamefully-hoist

COPY packages/shared packages/shared
COPY apps/worker apps/worker

RUN pnpm exec tsc -p packages/shared/tsconfig.json

RUN pnpm exec prisma generate --schema apps/api/prisma/schema.prisma

RUN pnpm exec tsc -p apps/worker/tsconfig.build.json

# ────────────────────────────────────────────────────────────────
# Stage 2 : Runner
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 workeruser

COPY --from=builder --chown=workeruser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=workeruser:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder --chown=workeruser:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=builder --chown=workeruser:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=workeruser:nodejs /app/packages/shared/package.json ./packages/shared/

COPY --from=builder --chown=workeruser:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=workeruser:nodejs /app/apps/worker/package.json ./apps/worker/

USER workeruser

# Le worker expose un serveur HTTP de health sur le port 3001
# (voir apps/worker/src/index.ts) — on l'utilise pour le healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3001/health/live || exit 1

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]