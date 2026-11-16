import { randomUUID } from 'node:crypto';
import type { TenantTx } from '../db/with-tenant.js';
import type { StorageProvider } from '../infra/storage/index.js';
import type { DocumentRepository } from '../repositories/document.repository.js';
import type { DocumentVersionRepository } from '../repositories/document-version.repository.js';
import type { AuditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import type { Env } from '../config/env.js';

export interface InitUploadInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  folderId?: string | null;
}

export interface InitUploadResult {
  documentId: string;
  versionId: string;
  uploadUrl: string;
}

export class DocumentUploadService {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly versionRepo: DocumentVersionRepository,
    private readonly storage: StorageProvider,
    private readonly auditService: AuditService,
    private readonly env: Env,
  ) {}

  async initUpload(
    tx: TenantTx,
    input: InitUploadInput,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<InitUploadResult> {
    // 1. Validations
    if (!this.env.ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new AppError(400, 'BAD_REQUEST', 'File type not allowed');
    }
    if (input.sizeBytes > this.env.MAX_FILE_SIZE_BYTES) {
      throw new AppError(400, 'BAD_REQUEST', 'File too large');
    }

    if (input.folderId) {
      const folder = await tx.folder.findFirst({ where: { id: input.folderId, deletedAt: null } });
      if (!folder) throw new AppError(404, 'NOT_FOUND', 'Folder not found');
    }

    // 2. Pré-génération des IDs et de la clé S3
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = `org/${orgId}/doc/${documentId}/v/${versionId}`;

    // 3. Transaction courte : Création Document + Version PENDING
    await withTenant(async (tx) => {
      await this.docRepo.create(tx, {
        id: documentId,
        name: input.filename, // Titre par défaut
        organizationId: orgId,
        uploadedById: userId,
        folderId: input.folderId ?? null,
      });

      await this.versionRepo.create(tx, {
        id: versionId,
        documentId,
        organizationId: orgId,
        versionNumber: 1,
        storageKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.sha256,
        status: 'PENDING_UPLOAD',
        uploadedById: userId,
      });
    });

    // 4. Génération de l'URL pré-signée (Hors transaction)
    const uploadUrl = await this.storage.presignUpload({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      checksumSha256: input.sha256,
    });

    return { documentId, versionId, uploadUrl };
  }

  async completeUpload(
    versionId: string,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<void> {
    // 1. Récupération de la version
    const version = await withTenant((tx) => this.versionRepo.findById(tx, versionId));
    if (!version) throw new AppError(404, 'NOT_FOUND', 'Upload not found');

    // Idempotence : si déjà uploadé, on ne fait rien
    if (version.status === 'UPLOADED') return;

    // 2. Vérification sur S3 (Hors transaction)
    const head = await this.storage.headObject(version.storageKey);

    if (!head) {
      await this._failVersion(versionId, orgId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File not found on storage');
    }

    if (head.size !== version.sizeBytes) {
      await this._failVersion(versionId, orgId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File size mismatch');
    }

    if (head.checksumSha256 && head.checksumSha256 !== version.checksumSha256) {
      await this._failVersion(versionId, orgId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File checksum mismatch');
    }

    // 3. Transaction courte : Confirmation + Audit
    await withTenant(async (tx) => {
      await this.versionRepo.update(tx, versionId, { status: 'UPLOADED' });

      await this.docRepo.update(tx, version.documentId, { currentVersionId: versionId });

      await this.auditService.record(tx, {
        action: 'DOCUMENT_UPLOAD',
        entityType: 'Document',
        entityId: version.documentId,
        organizationId: orgId,
        actorId: userId,
        metadata: { versionId, versionNumber: version.versionNumber },
      });
    });
  }

  private async _failVersion(
    versionId: string,
    orgId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<void> {
    try {
      const version = await withTenant((tx) => this.versionRepo.findById(tx, versionId));
      if (version) {
        await withTenant((tx) => this.versionRepo.update(tx, versionId, { status: 'FAILED' }));
        await this.storage.deleteObject(version.storageKey);
      }
    } catch {
      // On ignore l'erreur de nettoyage pour ne pas masquer l'erreur d'origine
    }
  }
}
