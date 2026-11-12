# AI Document Manager

Plateforme de gestion documentaire pour entreprises : centralisation de
fichiers, traitement automatique, recherche full-text + vectorielle, assistant
IA avec citations de sources.

Développé en solo avec les pratiques d’une équipe professionnelle.
Architecture et décisions structurantes : voir [`docs/adr/`](./docs/adr/).

## Stack

Monorepo **pnpm** · **React + Vite** (front) · **Express** (API) ·
**BullMQ** (worker) · **Prisma** · **PostgreSQL + pgvector** · **Redis** ·
**Silo** (stockage S3, fork MinIO) · **Vitest** + **Playwright** ·
**GitHub Actions**

## Démarrage local

```bash
cp .env.example .env        # ajuster les secrets locaux si besoin
pnpm install
pnpm infra:up               # Postgres, Redis, Silo

# Base de données
pnpm --filter @aidm/api db:migrate   # crée le schéma
pnpm --filter @aidm/api db:rls       # active la RLS + sync mot de passe aidm_app
pnpm --filter @aidm/api db:seed      # insère les données de démo
```

## Services

| Service      | URL                   | Identifiants(dev) |
| ------------ | --------------------- | ----------------- |
| PostgreSQL   | localhost:5432        | voir .env         |
| Redis        | localhost:6379        | ___               |
| Silo API S3  | http://localhost:9000 | voir .env         |
| Silo Console | http://localhost:9001 | voir .env         |

## Identifiants de démo

| Email          | Rôle   | Mot de passe |
| -------------- | ------ | ------------ |
| alice@acme.com | ADMIN  | alice        |
| bob@acme.com   | EDITOR | bob          |

**Dev local uniquement.**

## Rôles PostgreSQL

| Rôle     | Usage                      | RLS    |
| -------- | -------------------------- | ------ |
| aidm     | migrations, seed, admin    | bypass |
| aidm_app | API runtime (DATABASE_URL) | active |

**L’API doit exécuter SET LOCAL app.organization_id = '<uuid>' au début de
chaque transaction. Voir ADR-0003.**

## Vérifications post-démarrage

1. docker compose ps → les 3 services sont healthy.
2. docker compose exec postgres psql -U aidm -d aidm -c "\dx" → vector listé.
3. docker compose exec redis redis-cli ping → PONG.
4. curl -i http://localhost:9000/minio/health/live → HTTP 200.
5. Console Silo accessible sur http://localhost:9001.

## Scripts

| Commande                                  | Effet                             |
| ----------------------------------------- | --------------------------------- |
| pnpm infra:up / down / reset              | Gestion de l’infra Docker         |
| pnpm lint / typecheck / test              | Qualité, sur tous les workspaces  |
| pnpm format / format:check                | Prettier                          |
| pnpm --filter @aidm/api db:migrate        | Applique les migrations (dev)     |
| pnpm --filter @aidm/api db:migrate:deploy | Applique les migrations (CI/prod) |
| pnpm --filter @aidm/api db:rls            | Applique rls.sql (idempotent)     |
| pnpm --filter @aidm/api db:seed           | Seed idempotent                   |
| pnpm --filter @aidm/api db:studio         | Prisma Studio                     |

## Reset complet

```
pnpm infra:reset
pnpm infra:up
pnpm --filter @aidm/api db:migrate
pnpm --filter @aidm/api db:rls
pnpm --filter @aidm/api db:seed
```

## Structure

```
apps/
  web/       React + Vite
  api/       Express + Prisma
  worker/    BullMQ
packages/
  shared/    Types et schémas Zod partagés
docs/adr/    Une décision = un fichier

```

## CI

3 jobs parallèles sur chaque PR vers main : lint, test (Postgres en
service), docker (compose up --wait). Voir ADR-0002.
