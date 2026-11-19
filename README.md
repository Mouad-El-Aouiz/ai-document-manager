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

## API

Toutes les routes métier sont sous `/api/v1/`, protégées par JWT (Bearer) et isolées par RLS. Le healthcheck reste à la racine.

### Authentification

| Méthode | Route                  | Auth   | Description                   |
| ------- | ---------------------- | ------ | ----------------------------- |
| `POST`  | `/api/v1/auth/login`   | —      | Login (`{ email, password }`) |
| `POST`  | `/api/v1/auth/refresh` | Cookie | Rotation refresh token        |
| `POST`  | `/api/v1/auth/logout`  | Cookie | Révocation refresh            |
| `GET`   | `/api/v1/auth/me`      | Bearer | Utilisateur courant           |

### Dossiers

| Méthode  | Route                            | Permission      |
| -------- | -------------------------------- | --------------- |
| `GET`    | `/api/v1/folders?parentId=`      | `folder:read`   |
| `POST`   | `/api/v1/folders`                | `folder:create` |
| `GET`    | `/api/v1/folders/:id`            | `folder:read`   |
| `PATCH`  | `/api/v1/folders/:id`            | `folder:update` |
| `PATCH`  | `/api/v1/folders/:id/move`       | `folder:update` |
| `GET`    | `/api/v1/folders/:id/breadcrumb` | `folder:read`   |
| `DELETE` | `/api/v1/folders/:id`            | `folder:delete` |

### Documents

| Méthode  | Route                                                | Permission        |
| -------- | ---------------------------------------------------- | ----------------- |
| `POST`   | `/api/v1/documents/uploads`                          | `document:write`  |
| `POST`   | `/api/v1/documents/uploads/:versionId/complete`      | `document:write`  |
| `GET`    | `/api/v1/documents?cursor=&limit=&folderId=&q=&tag=` | `document:read`   |
| `GET`    | `/api/v1/documents/:id`                              | `document:read`   |
| `GET`    | `/api/v1/documents/:id/download`                     | `document:read`   |
| `PATCH`  | `/api/v1/documents/:id`                              | `document:write`  |
| `PATCH`  | `/api/v1/documents/:id/metadata`                     | `document:write`  |
| `PUT`    | `/api/v1/documents/:id/tags`                         | `document:write`  |
| `DELETE` | `/api/v1/documents/:id`                              | `document:delete` |

### Versions

| Méthode | Route                                                | Permission       |
| ------- | ---------------------------------------------------- | ---------------- |
| `GET`   | `/api/v1/documents/:id/versions`                     | `document:read`  |
| `POST`  | `/api/v1/documents/:id/versions`                     | `document:write` |
| `POST`  | `/api/v1/documents/:id/versions/:versionId/complete` | `document:write` |
| `GET`   | `/api/v1/documents/:id/versions/:versionId/download` | `document:read`  |
| `POST`  | `/api/v1/documents/:id/versions/:versionId/restore`  | `document:write` |

### Tags

| Méthode  | Route              | Permission  |
| -------- | ------------------ | ----------- |
| `GET`    | `/api/v1/tags`     | `tag:read`  |
| `POST`   | `/api/v1/tags`     | `tag:write` |
| `PATCH`  | `/api/v1/tags/:id` | `tag:write` |
| `DELETE` | `/api/v1/tags/:id` | `tag:write` |

### Audit

| Méthode | Route                                                                                          | Permission           |
| ------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| `GET`   | `/api/v1/audit-logs?cursor=&limit=&action=&entityType=&entityId=&actorId=&startDate=&endDate=` | `audit:read` (ADMIN) |

### Documentation

- `GET /api/v1/docs` — spec OpenAPI (JSON)
- `GET /api/v1/docs/ui` — Swagger UI (dev uniquement)

### Matrice RBAC

| Rôle       | folder:read | folder:create | folder:update | folder:delete | document:read | document:write | document:delete | tag:read | tag:write | audit:read |
| ---------- | ----------- | ------------- | ------------- | ------------- | ------------- | -------------- | --------------- | -------- | --------- | ---------- |
| **ADMIN**  | ✅          | ✅            | ✅            | ✅            | ✅            | ✅             | ✅              | ✅       | ✅        | ✅         |
| **EDITOR** | ✅          | ✅            | ✅            | ❌            | ✅            | ✅             | ❌              | ✅       | ✅        | ❌         |
| **VIEWER** | ✅          | ❌            | ❌            | ❌            | ✅            | ❌             | ❌              | ✅       | ❌        | ❌         |

## Worker de maintenance

Le worker `apps/worker` exécute trois jobs récurrents :

| Job                       | Fréquence     | Action                                                 |
| ------------------------- | ------------- | ------------------------------------------------------ |
| `cleanup-pending-uploads` | toutes les 6h | Supprime les uploads `PENDING_UPLOAD` > 24h            |
| `purge-deleted-items`     | 1x/jour à 3h  | Hard-delete des documents/dossiers soft-deleted > 30j  |
| `purge-old-versions`      | 1x/jour à 4h  | Supprime les versions au-delà de la rétention par plan |

Lancement : `pnpm --filter @aidm/worker dev`.
