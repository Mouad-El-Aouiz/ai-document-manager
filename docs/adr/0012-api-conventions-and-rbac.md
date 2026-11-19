# ADR-0012 — Conventions API et matrice RBAC

- **Statut :** Accepté
- **Date :** 2026-11-16
- **Portée :** toutes les routes (finalisation Phase 2)
- **Complète :** ADR-0008 (conventions de pagination et 404)

## Décisions

### 1. Matrice RBAC

Permissions centralisées dans `apps/api/src/middlewares/rbac.ts` :

| Permission        | ADMIN | EDITOR | VIEWER |
| ----------------- | ----- | ------ | ------ |
| `folder:read`     | ✅    | ✅     | ✅     |
| `folder:create`   | ✅    | ✅     | ❌     |
| `folder:update`   | ✅    | ✅     | ❌     |
| `folder:delete`   | ✅    | ❌     | ❌     |
| `document:read`   | ✅    | ✅     | ✅     |
| `document:write`  | ✅    | ✅     | ❌     |
| `document:delete` | ✅    | ❌     | ❌     |
| `tag:read`        | ✅    | ✅     | ✅     |
| `tag:write`       | ✅    | ✅     | ❌     |
| `audit:read`      | ✅    | ❌     | ❌     |

**Règles structurantes :**

- `ADMIN` a `*` (wildcard).
- Les actions destructives (`folder:delete`, `document:delete`) sont réservées aux ADMIN.
- L'audit est réservé aux ADMIN (`audit:read`).

### 2. Versioning de l'API

- Toutes les routes métier sous `/api/v1/`.
- `GET /health` et `/health/live` restent à la racine (healthchecks infra).

### 3. Pagination et filtres

Voir ADR-0008. Ajouts :

- `?tag=<name>` sur `GET /documents` (filtre par nom de tag normalisé).
- `?q=<term>` sur `GET /documents` (recherche floue via `pg_trgm`).

### 4. Upload et versions

- Upload en deux temps (`init` + `complete`) : voir ADR-0007.
- Restauration d'une version crée une nouvelle version physique via `CopyObject` : voir ADR-0006.

### 5. Codes d'erreur stables

- `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- Format unique : `{ error: { code, message, details?, requestId } }`.

## Conséquences

- **Positives :** matrice RBAC documentée → un nouveau dev voit immédiatement qui peut faire quoi. Test d'isolation dédié couvre **toutes** les routes.
- **Négatives :** la matrice doit être mise à jour à chaque nouvelle route (process manuel, à automatiser via un lint custom si besoin).
