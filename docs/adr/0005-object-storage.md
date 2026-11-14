# ADR-0005 — Stockage objet : clés, URL pré-signées, endpoints

- **Statut :** Accepté
- **Date :** 2026-11-14
- **Portée :** Phase 2 (gestion documentaire)

## Contexte

L'API doit stocker des fichiers sans les faire transiter par le serveur Node (pour éviter de bloquer le thread principal et d'exploser la RAM). On utilise le pattern des URL pré-signées S3.

## Décision

### 1. Interface `StorageProvider`

- Abstraction (`presignUpload`, `presignDownload`, `headObject`, `copyObject`, `deleteObject`, `deleteMany`) pour faciliter le passage de MinIO en dev à Cloudflare R2 en prod.
- `FakeStorageProvider` pour les tests unitaires.

### 2. Double endpoint (interne vs public)

- Le backend parle à MinIO via `http://minio:9000` (réseau Docker).
- Les URLs pré-signées sont générées avec `http://localhost:9000` (ou le domaine public en prod).
- **Pourquoi :** la signature S3 inclut le host. Une URL signée avec `minio:9000` ne fonctionnerait pas dans le navigateur de l'utilisateur.

### 3. Clé S3

- Format : `org/{orgId}/doc/{documentId}/v/{versionId}`.
- Le nom d'origine du fichier reste en base de données (`DocumentVersion.originalFilename`), jamais dans la clé S3.

### 4. Règle d'or : "Pas de S3 dans une transaction"

- Les appels S3 peuvent prendre du temps (upload, copie).
- Bloquer une connexion PostgreSQL pendant un appel S3 épuise le pool de connexions.
- **Pattern imposé :**
  1. Transaction courte (création des lignes PENDING).
  2. Appel S3 (hors transaction).
  3. Transaction courte de confirmation.

### 5. Magic bytes (reporté)

- La vérification du type réel (magic bytes) est reportée à la Phase IA.
- **Limite connue :** le `mimeType` fourni par le client n'est pas une preuve. Un point d'extension est prévu dans le `UploadService` pour brancher un antivirus ou un checker de magic bytes plus tard.

## Conséquences

- **Positives :** Scalabilité (le backend ne gère pas les fichiers), sécurité (bucket privé), flexibilité (URLs signées à courte durée de vie).
- **Négatives :** Dépendance à la configuration CORS du bucket, complexité du double endpoint.
