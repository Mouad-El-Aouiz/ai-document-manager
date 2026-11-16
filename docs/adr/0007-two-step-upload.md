# ADR-0007 — Upload en deux temps

- **Statut :** Accepté
- **Date :** 2026-11-15
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

L'API ne doit pas servir de proxy pour les fichiers (blocage mémoire, I/O). Le client doit uploader directement sur le stockage objet.

## Décision

1. **Init** : `POST /documents/uploads` crée le conteneur (Document + DocumentVersion `PENDING_UPLOAD`) et retourne une URL `PUT` pré-signée.
2. **Complete** : `POST /documents/uploads/:versionId/complete` vérifie via `HEAD` S3 la taille et le checksum, puis confirme l'upload (`UPLOADED`) et définit `currentVersionId`.
3. **Intégrité** : Le SHA-256 fourni à l'init est lié à la signature S3 (`x-amz-checksum-sha256`) et revérifié au `complete`.
4. **S3 hors transaction** : Aucun appel S3 n'est fait à l'intérieur d'une transaction DB.

## Conséquences

- **Positives** : Scalabilité, intégrité garantie, isolation DB/S3.
- **Négatives** : Le client doit gérer deux appels API. Les `PENDING_UPLOAD` abandonnés seront nettoyés par un job (5.10).
