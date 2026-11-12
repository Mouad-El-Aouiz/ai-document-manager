# ADR-0001 — Monorepo pnpm et infrastructure Docker locale

- **Statut :** Accepté
- **Date :** 2026-11-09
- **Portée :** fondations du projet

## Contexte

Projet solo avec pratiques d’équipe : front React, API Express, worker BullMQ,
package de types partagés, et trois services d’infrastructure (PostgreSQL +
pgvector, Redis, stockage objet S3). Budget 0 $. Il faut choisir comment
organiser le code et comment faire tourner l’infra localement.

## Décision

### 1. Monorepo pnpm workspaces

- `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, scope `@aidm/*`.
- Aucune dépendance runtime à la racine — seulement scripts et config.
- `packageManager` et `engines` figés (Corepack).

**Pourquoi pnpm :** store global + liens physiques → install rapide et empreinte
disque réduite, pas de dépendances fantômes. Le monorepo est petit (4 packages) :
Nx/Turborepo seraient sur-dimensionnés.

### 2. Docker Compose pour l’infra locale

- Un `docker-compose.yml` : Postgres (image `pgvector/pgvector:pg16`), Redis
  (`redis:7-alpine`, AOF activé pour BullMQ), stockage objet (`pgsty/silo:latest`,
  fork communautaire de MinIO — l’image `minio/minio` n’est plus accessible
  sur Docker Hub).
- Ports standards : 5432, 6379, 9000 (S3), 9001 (console).
- Volumes nommés persistants, réseau `aidm-network`, healthchecks sur les trois
  services (`--wait` exploitable en CI).

### 3. pgvector activé via `init.sql`

- Extension `vector` créée au premier boot du conteneur
  (`docker/postgres/init.sql`), pas via Prisma.
- Script idempotent, échoue bruyamment si pgvector ne s’installe pas.

**Pourquoi hors Prisma :** `CREATE EXTENSION` est une prérogative Postgres, pas
du schéma métier. Le mettre dans une migration Prisma complique l’idempotence
et les rollbacks. Les migrations Prisma supposeront l’extension déjà présente.

## Conséquences

**Positives**

- Environnement local reproductible en 3 commandes.
- Structure extensible : ajouter une app = créer un dossier + `package.json`.
- Config TS stricte partagée à la racine, overrides locaux minimes.

**Négatives**

- Nom du projet Compose (`aidm`) distinct du repo (`ai-document-manager`).
- Pas de healthcheck natif pour Silo si `curl` disparaît d’une future version
  de l’image → vérifier à chaque bump.

## Alternatives écartées

- **Polyrepo** : coordination coûteuse pour un dev solo.
- **Bases hébergées (Neon, Supabase)** : dépendance réseau, comptes, budget 0 $.
- **`CREATE EXTENSION` via migration Prisma** : idempotence bancale.
- **Nx / Turborepo** : sur-dimensionné à cette échelle.

## Références

- <https://pnpm.io/workspaces>
- <https://hub.docker.com/r/pgvector/pgvector>
- <https://adr.github.io/>