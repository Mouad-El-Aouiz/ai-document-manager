# ────────────────────────────────────────────────────────────────
# Builder
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copie des manifests pour profiter du cache de pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Copie du code source
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared

# Génère le client Prisma + compile
RUN pnpm --filter @aidm/api exec prisma generate
RUN pnpm --filter @aidm/api build

# ────────────────────────────────────────────────────────────────
# Runner
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY --from=builder --chown=apiuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=apiuser:nodejs /app/packages/shared ./packages/shared

USER apiuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/health/live || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]