# ADR-0001 — Monorepo pnpm + Docker Compose local

- **Statut :** Accepté
- **Date :** 2026-11-09
- **Décideur :** développeur unique
- **Portée :** fondations du projet (Phase 1, étape 1)

## Contexte

Le projet _AI Document Manager_ est développé en solo mais avec des pratiques d’équipe.
Il combine plusieurs applications (front React, API Express, worker BullMQ) et un
package partagé de types/schémas. Il dépend de trois services d’infrastructure
(PostgreSQL + pgvector, Redis, pgsty/silo) qui doivent tourner localement sans budget.

Deux décisions de fond doivent être prises dès la première étape :

1. Comment organiser le code entre les applications ?
2. Comment faire tourner les services d’infrastructure localement ?

## Décision

### 1. Monorepo pnpm

- **Monorepo unique** structuré en `apps/*` et `packages/*`, géré par
  **pnpm workspaces**.
- Convention de nommage : scope `@aidm/*`.
- Aucune dépendance partagée n’est installée à la racine (le `package.json`
  racine ne contient que des scripts d’infra et de la config).

**Raison du choix de pnpm vs npm/yarn workspaces :**

- pnpm installe un **store global** et crée des liens physiques → installation
  plus rapide et empreinte disque réduite (important en solo sur une machine de dev).
- Le monorepo sera de petite taille (4 packages), donc les alternatives restent
  valables ; pnpm l’emporte sur la **vitesse** et la **rigueur** (pas de
  dépendances fantômes).
- `packageManager` verrouille la version via Corepack → reproductibilité.

### 2. Docker Compose pour l’infrastructure locale

- **Un seul `docker-compose.yml`** regroupe PostgreSQL (pgvector), Redis, pgsty/silo.
- Pas de service applicatif dans le compose à cette étape.
- Ports standards : 5432, 6379, 9000, 9001.
- Réseau Docker dédié `aidm-network`, volumes nommés persistants.

**Raison du choix de Docker Compose :**

- Isolation reproductible de l’environnement, sans polluer la machine de dev.
- Zéro dépendance à un service cloud payant.
- Compatible avec un futur déploiement (Render/Fly.io) : les images sont
  les mêmes qu’en prod managée.

### 3. Initialisation de pgvector via `init.sql`

- L’extension `vector` est activée **au premier démarrage** du conteneur
  PostgreSQL via `docker/postgres/init.sql`, monté en
  `/docker-entrypoint-initdb.d/01-init.sql`.

**Pourquoi ici plutôt que via Prisma migrations :**

- L’extension est une prérogative **Postgres**, pas du schéma métier.
- Un `CREATE EXTENSION` échoue en migration Prisma s’il est déjà installé
  (idempotence bancale) → devoir gérer des cas particuliers côté Prisma est
  inutilement fragile.
- Le script d’init est **idempotent** (`IF NOT EXISTS`) et échoue **bruyamment**
  si pgvector ne s’installe pas.
- Prisma pourra, dans ses migrations futures, se contenter de créer les
  colonnes `vector(...)` en supposant que l’extension existe.

### 4. Image objet : `pgsty/silo` (fork communautaire de MinIO)

- L’image officielle `minio/minio` n’est plus accessible sur Docker Hub
  (pull refusé au moment de l’étape 1).
- Nous utilisons **`pgsty/silo:latest`**, un fork maintenu par la communauté
  Pigsty, compatible avec l’API S3, les variables `MINIO_*` et la commande
  `server /data --console-address :9001`.
- Le healthcheck s’appuie sur l’endpoint HTTP `/minio/health/live` (compatible
  avec l’héritage MinIO de Silo), via `curl` **si présent dans l’image** ;
  à défaut, l’image reste fonctionnelle mais apparaît `unhealthy` dans
  `docker compose ps` — vérification manuelle alors nécessaire.

**Conséquence :** le service reste nommé `minio` dans le Compose et les
variables d’environnement restent `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
pour limiter les changements. La console est accessible sur le port 9001.

## Conséquences

### Positives

- Environnement local reproductible en 3 commandes (`pnpm install`,
  `cp .env.example .env`, `pnpm infra:up`).
- Structure de monorepo extensible : ajouter une app ou un package = créer un
  dossier + un `package.json`.
- Séparation nette entre **config TypeScript racine** (stricte) et
  **configs locales** (qui peuvent assouplir pour le bundler du front).
- L’ADR peut être référencé par les futurs ADRs (ex. sur le choix de Prisma,
  sur l’auth, etc.).

### Négatives / coûts

- Les contributions externes sont marginales (projet solo), donc le coût
  d’onboarding du monorepo est nul.
- Aucune CI encore branchée → le monorepo n’est pas encore “gardé” par un
  pipeline. **Mitigation :** CI introduite à l’étape suivante.

### Neutres

- Le nom du projet Compose (`aidm`) est distinct du nom du repo
  (`ai-document-manager`) → à garder cohérent si on renomme le projet.
- Pas de healthcheck MinIO (image sans outillage) → vérification manuelle
  documentée dans le README.

## Alternatives considérées

- **Polyrepo** : rejeté, la coordination (types partagés, PR croisées) coûte
  plus cher que le monorepo pour un dev solo.
- **Turborepo / Nx** : rejeté pour l’instant, sur-dimensionné (4 packages).
  On pourra réévaluer si le build devient long (>30s).
- **Bases de données hébergées (Neon, Supabase) en local** : rejeté, dépendance
  réseau + comptes, alors que Docker Compose suffit.
- **Créer l’extension via Prisma migration** : rejeté (cf. section 3).

## Références

- pnpm workspaces : <https://pnpm.io/workspaces>
- pgvector Docker image : <https://hub.docker.com/r/pgvector/pgvector>
- Format ADR : <https://adr.github.io/>
