import { randomUUID } from 'node:crypto';
import type { TenantTx } from '@aidm/shared';
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

export interface InitNewVersionResult {
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

  private validateFile(input: { mimeType: string; sizeBytes: number }): void {
    if (!this.env.ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new AppError(400, 'BAD_REQUEST', 'File type not allowed');
    }
    if (input.sizeBytes > this.env.MAX_FILE_SIZE_BYTES) {
      throw new AppError(400, 'BAD_REQUEST', 'File too large');
    }
  }

  async initUpload(
    tx: TenantTx,
    input: InitUploadInput,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<InitUploadResult> {
    this.validateFile(input);

    if (input.folderId) {
      const folder = await tx.folder.findFirst({ where: { id: input.folderId, deletedAt: null } });
      if (!folder) throw new AppError(404, 'NOT_FOUND', 'Folder not found');
    }

    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = `org/${orgId}/doc/${documentId}/v/${versionId}`;

    await withTenant(async (innerTx) => {
      await this.docRepo.create(innerTx, {
        id: documentId,
        name: input.filename,
        organizationId: orgId,
        uploadedById: userId,
        folderId: input.folderId ?? null,
      });

      await this.versionRepo.create(innerTx, {
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

    const uploadUrl = await this.storage.presignUpload({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      checksumSha256: input.sha256,
    });

    return { documentId, versionId, uploadUrl };
  }

  async initNewVersion(
    tx: TenantTx,
    documentId: string,
    input: InitUploadInput,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<InitNewVersionResult> {
    this.validateFile(input);

    const versionId = randomUUID();
    const storageKey = `org/${orgId}/doc/${documentId}/v/${versionId}`;

    await withTenant(async (innerTx) => {
      await this.docRepo.lockDocument(innerTx, documentId);
      const doc = await this.docRepo.findById(innerTx, documentId);
      if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');

      const versionNumber = await this.versionRepo.getNextVersionNumber(innerTx, documentId);

      await this.versionRepo.create(innerTx, {
        id: versionId,
        documentId,
        organizationId: orgId,
        versionNumber,
        storageKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.sha256,
        status: 'PENDING_UPLOAD',
        uploadedById: userId,
      });
    });

    const uploadUrl = await this.storage.presignUpload({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.sizeBytes,
      checksumSha256: input.sha256,
    });

    return { versionId, uploadUrl };
  }

  async completeUpload(
    versionId: string,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<void> {
    const version = await withTenant((tx) => this.versionRepo.findById(tx, versionId));
    if (!version) throw new AppError(404, 'NOT_FOUND', 'Upload not found');

    // Idempotence : déjà uploadé
    if (version.status === 'UPLOADED') return;

    // S3 HEAD (hors transaction)
    const head = await this.storage.headObject(version.storageKey);
    if (!head) {
      await this._failVersion(versionId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File not found on storage');
    }
    if (head.size !== version.sizeBytes) {
      await this._failVersion(versionId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File size mismatch');
    }
    if (head.checksumSha256 && head.checksumSha256 !== version.checksumSha256) {
      await this._failVersion(versionId, withTenant);
      throw new AppError(400, 'BAD_REQUEST', 'File checksum mismatch');
    }

    // Transaction courte : confirmation + concurrence
    await withTenant(async (tx) => {
      await this.docRepo.lockDocument(tx, version.documentId);
      const doc = await this.docRepo.findById(tx, version.documentId);
      if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');

      const currentVersion = doc.currentVersionId
        ? await this.versionRepo.findById(tx, doc.currentVersionId)
        : null;

      // La version la plus récente l'emporte
      const shouldUpdateCurrent =
        !currentVersion || version.versionNumber > currentVersion.versionNumber;

      await this.versionRepo.update(tx, versionId, { status: 'UPLOADED' });
      if (shouldUpdateCurrent) {
        await this.docRepo.update(tx, version.documentId, { currentVersionId: versionId });
      }

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
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<void> {
    try {
      const version = await withTenant((tx) => this.versionRepo.findById(tx, versionId));
      if (version) {
        await withTenant((tx) => this.versionRepo.update(tx, versionId, { status: 'FAILED' }));
        await this.storage.deleteObject(version.storageKey);
      }
    } catch {
      // Ignorer
    }
  }

  /**
   * Retourne la limite de rétention pour un plan donné.
   */
  getRetentionLimit(plan: 'FREE' | 'PRO' | 'ENTERPRISE'): number {
    if (plan === 'FREE') return this.env.RETENTION_FREE_VERSIONS;
    if (plan === 'PRO') return this.env.RETENTION_PRO_VERSIONS;
    return this.env.RETENTION_ENTERPRISE_VERSIONS;
  }
}
