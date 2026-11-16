import { randomUUID } from 'node:crypto';
import type { DocumentVersion, OrganizationPlan } from '@prisma/client';
import type { TenantTx } from '@aidm/shared';
import { documentVersionRepository } from '../repositories/document-version.repository.js';
import { documentRepository } from '../repositories/document.repository.js';
import type { StorageProvider } from '../infra/storage/index.js';
import type { AuditService } from './audit.service.js';
import type { DocumentUploadService } from './document-upload.service.js';
import { AppError } from '../errors/AppError.js';

export class DocumentVersionService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly auditService: AuditService,
    private readonly uploadService: DocumentUploadService,
  ) {}

  async list(tx: TenantTx, documentId: string): Promise<DocumentVersion[]> {
    const doc = await documentRepository.findById(tx, documentId);
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');
    return documentVersionRepository.findByDocument(tx, documentId);
  }

  async download(
    tx: TenantTx,
    documentId: string,
    versionId: string,
    orgId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const doc = await documentRepository.findById(tx, documentId);
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');

    const version = await documentVersionRepository.findById(tx, versionId);
    if (version?.documentId !== documentId) {
      throw new AppError(404, 'NOT_FOUND', 'Version not found');
    }
    if (version.status !== 'UPLOADED' && version.status !== 'READY') {
      throw new AppError(400, 'BAD_REQUEST', 'Version is not available for download');
    }

    const url = await this.storage.presignDownload(version.storageKey, version.originalFilename);

    await this.auditService.record(tx, {
      action: 'DOCUMENT_DOWNLOAD',
      entityType: 'DocumentVersion',
      entityId: versionId,
      organizationId: orgId,
      actorId: userId,
      metadata: { versionNumber: version.versionNumber },
    });

    return { url };
  }

  async restore(
    tx: TenantTx,
    documentId: string,
    versionId: string,
    orgId: string,
    userId: string,
    withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>,
  ): Promise<DocumentVersion> {
    const doc = await documentRepository.findById(tx, documentId);
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found');

    const oldVersion = await documentVersionRepository.findById(tx, versionId);
    if (oldVersion?.documentId !== documentId) {
      throw new AppError(404, 'NOT_FOUND', 'Version not found');
    }
    if (oldVersion.status !== 'UPLOADED' && oldVersion.status !== 'READY') {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot restore a version that was never uploaded');
    }

    const newVersionId = randomUUID();
    const newStorageKey = `org/${orgId}/doc/${documentId}/v/${newVersionId}`;

    // 1. Copie S3 (HORS transaction)
    await this.storage.copyObject(oldVersion.storageKey, newStorageKey);

    // 2. Transaction de confirmation
    try {
      return await withTenant(async (innerTx) => {
        await documentRepository.lockDocument(innerTx, documentId);
        const versionNumber = await documentVersionRepository.getNextVersionNumber(
          innerTx,
          documentId,
        );

        const newVersion = await documentVersionRepository.create(innerTx, {
          id: newVersionId,
          documentId,
          organizationId: orgId,
          versionNumber,
          storageKey: newStorageKey,
          originalFilename: oldVersion.originalFilename,
          mimeType: oldVersion.mimeType,
          sizeBytes: oldVersion.sizeBytes,
          checksumSha256: oldVersion.checksumSha256,
          status: 'UPLOADED',
          uploadedById: userId,
        });

        await documentRepository.update(innerTx, documentId, { currentVersionId: newVersion.id });

        await this.auditService.record(innerTx, {
          action: 'DOCUMENT_RESTORE',
          entityType: 'DocumentVersion',
          entityId: newVersion.id,
          organizationId: orgId,
          actorId: userId,
          metadata: { restoredFrom: versionId, versionNumber },
        });

        return newVersion;
      });
    } catch (error: unknown) {
      await this.storage.deleteObject(newStorageKey).catch(() => undefined);
      throw error;
    }
  }

  getRetentionLimit(plan: OrganizationPlan): Promise<number> {
    return Promise.resolve(this.uploadService.getRetentionLimit(plan));
  }
}
