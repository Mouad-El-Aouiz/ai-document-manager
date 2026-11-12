# ADR-0003 — Schéma de base de données, embeddings vector(768) et RLS

- **Statut :** Accepté
- **Date :** 2026-11-12
- **Portée :** fondations + gestion documentaire (Phases 1 et 2)

## Contexte

Le schéma doit couvrir la Phase 1 (organisations, utilisateurs) et la Phase 2
(dossiers, documents, chunks, audit) tout en préparant la recherche vectorielle
de la Phase 4. Trois contraintes structurantes :

1. Multi-tenant strict : toute requête doit être filtrée par `organizationId`.
2. Embeddings liés à `nomic-embed-text` (768 dimensions, inchangé entre dev et
   prod pour garantir la cohérence).
3. Prisma ne gère pas la Row-Level Security.

## Décision

### 1. Schéma Prisma et migration nommée

- 6 modèles : `Organization`, `User`, `Folder`, `Document`, `DocumentChunk`,
  `AuditLog`.
- Enums : `UserRole`, `DocumentStatus`, `OrganizationPlan` (défaut `FREE`).
- Convention de migration `NNNN_nom`, la première étant `0001_init_schema`.
  Le SQL est généré par Prisma puis renommé (via `--create-only`) pour garder
  le contrôle du nom.
- `onDelete` par défaut `Restrict`, exceptions : `Cascade` sur
  `Document → DocumentChunk`, `SetNull` sur `Folder.parentId`, `SetNull` sur
  `AuditLog.userId` (traçabilité conservée si l’utilisateur est supprimé).

**Pourquoi `Restrict` par défaut :** empêche les suppressions en cascade
accidentelles d’organisations entières. La suppression d’une org passe par un
job de purge explicite (hors périmètre actuel).

### 2. `organizationId` sur chaque table

- Présent sur toutes les tables sauf `Organization` (racine du tenant).
- `DocumentChunk` **dénormalise** `organizationId` et l’ancre par une **FK
  composite** `(documentId, organizationId) → Document (id, organizationId)`.
- `Document` porte `@@unique([id, organizationId])` pour rendre la FK composite
  valide.

**Pourquoi dénormaliser :** RLS et filtres de permissions triviaux sur les
chunks (qui seront volumineux en Phase 4). La FK composite garantit la
cohérence côté base — pas de code applicatif à maintenir.

### 3. Embeddings : `Unsupported("vector(768)")`

- Type : `Unsupported("vector(768)")?` — nullable.
- Modèle d’embedding stocké par chunk : `embeddingModel String` (= `nomic-embed-text`
  en dev et prod).
- Pas d’index HNSW à cette étape — créé en Phase 4, documenté dans un futur ADR.

**Pourquoi `Unsupported` et pas `String` :** `String` perdrait la sémantique
vectorielle et forcerait un cast applicatif. `Unsupported("vector(768)")` fige
la dimension au niveau base — un insert avec une autre dimension échouerait.

**Conséquence directe :** Prisma Client **ne type pas** cette colonne. Aucune
méthode `prisma.documentChunk.findMany({ select: { embedding: true } })` n’est
générée. Toutes les requêtes vectorielles passeront par `$queryRaw`. C’est
attendu et documenté dans le code qui les utilisera (Phase 4).

### 4. Row-Level Security dans `rls.sql` séparé

- `init.sql` (au boot Postgres) crée l’extension `vector` et le rôle
  `aidm_app` (non-superuser, LOGIN, sans mot de passe — synchronisé par
  `db:rls` depuis `.env`).
- `apps/api/prisma/rls.sql` : `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY
tenant_isolation` sur les 6 tables. Idempotent.
- `apps/api/scripts/apply-rls.ts` : applique `rls.sql` et synchronise le mot de
  passe de `aidm_app` depuis `DATABASE_URL`.
- L’API runtime utilise `DATABASE_URL` = `aidm_app`. Les migrations, le seed et
  l’admin utilisent `DATABASE_URL_MIGRATE` = `aidm` (superuser, bypass RLS).
- Contrat avec l’API : `SET LOCAL app.organization_id = '<uuid>'` au début de
  chaque transaction. Si absent, `current_setting(..., true)` renvoie NULL et
  toutes les policies retournent FALSE → 0 ligne. Sûr par défaut.

**Pourquoi `rls.sql` séparé et pas dans la migration Prisma :** Prisma ne gère
pas la RLS. Mettre la RLS dans `migration.sql` obligerait à l’éditer à la main
après chaque `prisma migrate dev`, et un futur `migrate reset` la ferait
disparaître silencieusement. Séparer la responsabilité (Prisma = schéma,
`rls.sql` = sécurité) est plus robuste.

**Pourquoi `REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app` :** les policies
RLS pour UPDATE/DELETE sont permissives par défaut et ORées avec
`tenant_isolation` → elles n’empêcheraient rien. Le REVOKE au niveau rôle est
infranchissable (l’app n’est pas superuser).

### 5. Seed et test d’intégration

- Seed idempotent (`upsert`) : Acme Corp (`FREE`), alice (`ADMIN`, mot de passe
  `alice`), bob (`EDITOR`, `bob`), dossier « Contrats », document PENDING
  placeholder (métadonnées only, pas de fichier réel dans Silo).
- Hash argon2id calculé à l’exécution (jamais hardcodé).
- Test d’intégration minimal : connexion + 6 tables présentes + extension
  `vector` installée. Exécuté en CI avec un service Postgres dédié.

## Conséquences

**Positives**

- Isolation multi-tenant garantie au niveau base, pas seulement applicatif.
- Dimensions d’embedding figées → dérive silencieuse impossible.
- Cohérence des chunks garantie par la FK composite.
- AuditLog immuable au niveau rôle PostgreSQL.

**Négatives**

- Chaque transaction API doit poser `SET LOCAL app.organization_id` — oubli =
  zéro ligne renvoyée (échec silencieux mais sûr). Mitigation : middleware
  Express obligatoire (ajouté à l’étape auth).
- Prisma Client ne type pas `embedding` → `$queryRaw` pour toute requête
  vectorielle. Assumé.
- Pas d’index HNSW : les recherches vectorielles seront lentes en Phase 4 tant
  que l’index n’est pas ajouté.

## Alternatives écartées

- **`String` pour `embedding`** : pas de contrainte dimensionnelle, erreurs
  détectées à l’exécution, pas à l’insert.
- **Exception `organizationId` sur `DocumentChunk`** : RLS via `EXISTS`
  coûteuse sur une table volumineuse.
- **RLS dans la migration Prisma** : fragilité face aux `migrate reset` et
  aux re-générations.
- **Rôle unique superuser pour l’app** : RLS ignorée pour les superusers →
  protection factice.

## Références

- <https://www.prisma.io/docs/orm/prisma-schema/data-model/unsupported-database-features>
- <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- <https://github.com/pgvector/pgvector>
- ADR-0001 : `0001-monorepo-et-infra-docker.md`
- ADR-0002 : `0002-outillage-qualite-et-ci.md`
