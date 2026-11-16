# ADR-0010 — Politique d'audit

- **Statut :** Accepté
- **Date :** 2026-11-16
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

Toute action sensible doit être traçable (sécurité, RGPD, support). L'audit doit être fiable même en cas d'erreur métier, et immuable pour éviter toute falsification.

## Décision

### 1. Catalogue d'actions typé

- `AuditAction` est un `z.enum`. Toute action inconnue est une **erreur de compilation**.
- Liste : FOLDER__, DOCUMENT__, TAG__, VERSION__, LOGIN_*, TOKEN_REUSE_DETECTED, LOGOUT.

### 2. Champs capturés

- `actorId`, `organizationId`, `action`, `entityType`, `entityId`.
- `requestId` et `ip` : extraits automatiquement via `AsyncLocalStorage`.
- `metadata` (JSONB) : avant/après des champs non sensibles, jamais de contenu de document ni d'URL pré-signée.

### 3. Atomicité

- L'audit est écrit **dans la même transaction** que l'action métier.
- Si l'action échoue, aucune entrée d'audit n'est créée.
- Exception : les téléchargements (pas d'écriture métier) utilisent `record()` avec une transaction dédiée courte.

### 4. Immuabilité SQL

- `aidm_app` a `INSERT`/`SELECT` sur `AuditLog`.
- `REVOKE UPDATE, DELETE` → l'API ne peut ni modifier ni supprimer un log.

### 5. Consultation

- Route `GET /api/v1/audit-logs` réservée aux ADMIN (`audit:read`).
- Pagination par curseur, filtres : `action`, `entityType`, `entityId`, `actorId`, `startDate`, `endDate`.

## Conséquences

- **Positives :** traçabilité complète, résistant aux falsifications, requêtable sans JOIN.
- **Négatives :** croissance illimitée de la table. La purge des logs > 1 an sera gérée par le job 5.10 (à implémenter plus tard si besoin).
