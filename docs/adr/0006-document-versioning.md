# ADR-0006 — Modèle de versioning

- **Statut :** Accepté
- **Date :** 2026-11-14
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

Un document peut évoluer (nouvelles versions de fichiers). Les métadonnées techniques (taille, hash, statut de traitement IA) s'appliquent au fichier physique, pas au conteneur logique.

## Décision

### 1. Séparation Document / DocumentVersion

- **`Document`** : conteneur logique (nom, dossier, métadonnées utilisateur).
- **`DocumentVersion`** : fichier physique (storageKey, taille, hash, statut, MIME).

### 2. `currentVersionId` (1:1 optionnel)

- `Document` pointe vers sa version active via `currentVersionId`.
- Permet de garder l'historique complet tout en sachant quelle version est "en vigueur".

### 3. Statut sur la Version

- L'enum `DocumentVersionStatus` (PENDING_UPLOAD, UPLOADED, SCANNING, PROCESSING, READY, FAILED) remplace l'ancien `DocumentStatus`.
- Le traitement IA (Phase 3) s'appliquera à une version précise.

### 4. FK composite `(documentId, organizationId)`

- Une version hérite de l'organisation de son document parent.
- Garantit qu'une version ne peut pas être rattachée à un document d'une autre organisation.

### 5. `DocumentChunk` rattaché à la version

- `DocumentChunk.documentVersionId` (nullable pour l'instant) permet de tracer de quelle version provient chaque chunk (utile pour la recherche et l'IA).

### 6. Immuabilité de `DocumentVersion`

- `aidm_app` a le droit `INSERT` et `SELECT` sur `DocumentVersion`.
- `aidm_app` n'a **PAS** le droit `DELETE` (REVOKE SQL).
- La purge des anciennes versions est réservée au worker/superuser (Phase 5.10).

## Conséquences

- **Positives** : Historique complet, isolation stricte, prêt pour le traitement IA par version.
- **Négatives** : Complexité accrue (jointures Document -> DocumentVersion -> DocumentChunk).
