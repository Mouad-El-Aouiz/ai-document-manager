import type { Document } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import {
  documentRepository,
  type DocumentWithCurrentVersion,
  type ListOptions,
} from '../repositories/document.repository.js';
import { folderRepository } from '../repositories/folder.repository.js';
import { tagRepository } from '../repositories/tag.repository.js';
import type { StorageProvider } from '../infra/storage/index.js';
import type { AuditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { z } from 'zod';

// Schéma de validation pour les métadonnées
const metadataSchema = z
  .record(
    z.string().max(50),
    z.union([z.string().max(500), z.number(), z.boolean()]),
  )
  .refine((obj) => Object.keys(obj).length <= 20, {
    message: 'Metadata cannot have more than 20 keys',
  });

export interface ListDocumentsInput {
  cursor?: string | undefined;
  limit: number;
  folderId?: string | null | undefined;
  q?: string | undefined;
  tagName?: string | undefined;
}

export interface ListDocumentsResult {
  documents: DocumentWithCurrentVersion[];
  nextCursor: string | null;
}

export interface UpdateDocumentInput {
  name?: string | undefined;
  folderId?: string | null | undefined;
}

export class DocumentService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly auditService: AuditService,
  ) {}

  async list(tx: TenantTx, input: ListDocumentsInput): Promise<ListDocumentsResult> {
    const options: ListOptions = {
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.q !== undefined ? { q: input.q } : {}),
      ...(input.tagName !== undefined ? { tagName: input.tagName } : {}),
    };

    const rows = await documentRepository.findAll(tx, options);
    const hasMore = rows.length > input.limit;
    const documents = hasMore ? rows.slice(0, input.limit) : rows;
    const lastDoc = documents[documents.length - 1];
    const nextCursor = hasMore && lastDoc ? lastDoc.id : null;

    return { documents, nextCursor };
  }

  async getById(tx: TenantTx, id: string): Promise<DocumentWithCurrentVersion> {
    const doc = await documentRepository.findByIdWithVersion(tx, id);
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Document not found');
    }
    return doc;
  }

  async download(
    tx: TenantTx,
    id: string,
    orgId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const doc = await this.getById(tx, id);
    const version = doc.currentVersion;
    if (!version) {
      throw new AppError(404, 'NOT_FOUND', 'Document has no available version');
    }
    if (version.status === 'PENDING_UPLOAD' || version.status === 'FAILED') {
      throw new AppError(404, 'NOT_FOUND', 'Document is not available for download');
    }

    const url = await this.storage.presignDownload(
      version.storageKey,
      version.originalFilename,
    );

    await this.auditService.record(tx, {
      action: 'DOCUMENT_DOWNLOAD',
      entityType: 'Document',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: { versionId: version.id, versionNumber: version.versionNumber },
    });

    return { url };
  }

  async update(
    tx: TenantTx,
    id: string,
    input: UpdateDocumentInput,
    orgId: string,
    userId: string,
  ): Promise<Document> {
    const doc = await this.getById(tx, id);

    if (input.folderId !== undefined && input.folderId !== null) {
      const folder = await folderRepository.findById(tx, input.folderId);
      if (!folder) {
        throw new AppError(404, 'NOT_FOUND', 'Target folder not found');
      }
    }

    const data: { name?: string; folderId?: string | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.folderId !== undefined) data.folderId = input.folderId;

    const updated = await documentRepository.update(tx, id, data);

    await this.auditService.record(tx, {
      action: 'DOCUMENT_UPDATE',
      entityType: 'Document',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: {
        before: { name: doc.name, folderId: doc.folderId },
        after: data,
      },
    });

    return updated;
  }

  async softDelete(tx: TenantTx, id: string, orgId: string, userId: string): Promise<void> {
    await this.getById(tx, id);
    await documentRepository.softDelete(tx, id);

    await this.auditService.record(tx, {
      action: 'DOCUMENT_DELETE',
      entityType: 'Document',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
    });
  }

  async updateMetadata(
    tx: TenantTx,
    id: string,
    metadata: unknown,
    orgId: string,
    userId: string,
  ): Promise<Document> {
    await this.getById(tx, id);
    const parsed = metadataSchema.parse(metadata);

    const updated = await documentRepository.update(tx, id, { metadata: parsed });

    await this.auditService.record(tx, {
      action: 'DOCUMENT_UPDATE',
      entityType: 'Document',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: { field: 'metadata' },
    });

    return updated;
  }

  async updateTags(
    tx: TenantTx,
    id: string,
    tagIds: string[],
    orgId: string,
    userId: string,
  ): Promise<DocumentWithCurrentVersion> {
    await this.getById(tx, id);

    if (tagIds.length > 20) {
      throw new AppError(400, 'BAD_REQUEST', 'Maximum 20 tags per document');
    }

    const uniqueTagIds = Array.from(new Set(tagIds));
    const tags = await tagRepository.findByIds(tx, uniqueTagIds);
    if (tags.length !== uniqueTagIds.length) {
      throw new AppError(400, 'BAD_REQUEST', 'One or more tags do not exist');
    }

    await tx.documentTag.deleteMany({ where: { documentId: id } });
    await tx.documentTag.createMany({
      data: uniqueTagIds.map((tagId) => ({ documentId: id, tagId })),
    });

    await this.auditService.record(tx, {
      action: 'DOCUMENT_UPDATE',
      entityType: 'Document',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: { field: 'tags', count: uniqueTagIds.length },
    });

    // getById retourne déjà DocumentWithCurrentVersion (avec tags inclus)
    return this.getById(tx, id);
  }
}