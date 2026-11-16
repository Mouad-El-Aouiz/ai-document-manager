# ADR-0008 — Conventions API

- **Statut :** Accepté
- **Date :** 2026-11-16
- **Portée :** toutes les routes métier

## Décisions

### 1. Pagination par curseur

- Curseur : `?cursor=<uuid>&limit=<n>` (défaut 20, max 100).
- Tri : `createdAt DESC, id DESC`.
- Réponse : `{ items: T[], nextCursor: string | null }`.
- **Pourquoi :** stable même quand `createdAt` n'est pas unique (deux documents créés à la même milliseconde), pas de drift avec les insertions concurrentes.

### 2. 404 plutôt que 403

- Une ressource d'une autre organisation → **404**.
- Une ressource soft-deleted → **404**.
- Une action interdite dans la même org (EDITOR essaie DELETE) → **403**.
- **Pourquoi :** distinguer "je n'ai pas le droit" (403) de "ça n'existe pas" (404) ne doit pas révéler l'existence d'une ressource à un utilisateur qui n'a pas le droit de la voir.

### 3. Filtres

- `?folderId=<uuid>` → documents de ce dossier.
- `?folderId=null` (littéral) → documents racine (`folderId IS NULL`).
- Absent → tous les documents.
- Les documents `PENDING_UPLOAD` sont **toujours exclus** du listing (filtre `currentVersionId IS NOT NULL`).

### 4. Téléchargement

- URL pré-signée **fraîche** à chaque requête, jamais stockée, jamais cachée.
- `Content-Disposition: attachment; filename="<sanitized>"` (aucun CR/LF ni guillemet).
- Audit `DOCUMENT_DOWNLOAD` systématique (qui, quand, quelle version).

### 5. Mise à jour partielle

- `PATCH` avec au moins un champ (`name` et/ou `folderId`).
- Si `folderId` fourni, on vérifie qu'il appartient au tenant.

## Conséquences

- **Positives :** pagination stable, pas de fuite d'existence, URLs jamais périmées côté client.
- **Négatives :** le client doit gérer `nextCursor` explicitement (pas de `page=N`).
