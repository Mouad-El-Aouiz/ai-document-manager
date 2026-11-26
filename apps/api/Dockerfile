# ────────────────────────────────────────────────────────────────
# Stage 1 : Builder
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Manifests pour le cache Docker
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# ⚠️ Copier le schéma Prisma AVANT pnpm install, sinon le postinstall
#    de apps/api ("prisma generate") échoue car le schéma n'existe pas encore.
COPY apps/api/prisma apps/api/prisma

RUN pnpm install --frozen-lockfile --shamefully-hoist

# Sources complètes (invalide le cache à chaque changement de code)
COPY packages/shared packages/shared
COPY apps/api apps/api

# Build du package partagé — tsc de la racine, pas de symlink cassé
RUN pnpm exec tsc -p packages/shared/tsconfig.json

# Régénère le client Prisma (au cas où le postinstall ait été ignoré)
RUN pnpm exec prisma generate --schema apps/api/prisma/schema.prisma

# Compile l'API
RUN pnpm exec tsc -p apps/api/tsconfig.build.json

# ────────────────────────────────────────────────────────────────
# Stage 2 : Runner
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY --from=builder --chown=apiuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=apiuser:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=builder --chown=apiuser:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=apiuser:nodejs /app/packages/shared/package.json ./packages/shared/

COPY --from=builder --chown=apiuser:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/package.json ./apps/api/

USER apiuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/health/live || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]