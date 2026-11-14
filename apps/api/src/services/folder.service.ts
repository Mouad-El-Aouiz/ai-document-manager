import type { Folder } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import { folderRepository } from '../repositories/folder.repository.js';
import { AppError } from '../errors/AppError.js';
import type { AuditService } from './audit.service.js';

export interface CreateFolderInput {
  name: string;
  parentId?: string | null | undefined;
}

export class FolderService {
  constructor(private readonly auditService: AuditService) {}

  async listAll(tx: TenantTx, parentId?: string | null): Promise<Folder[]> {
    return folderRepository.findAll(tx, { parentId });
  }

  async getById(tx: TenantTx, id: string): Promise<Folder> {
    const folder = await folderRepository.findById(tx, id);
    if (!folder) {
      throw new AppError(404, 'NOT_FOUND', 'Folder not found');
    }
    return folder;
  }

  async create(
    tx: TenantTx,
    input: CreateFolderInput,
    orgId: string,
    userId: string,
  ): Promise<Folder> {
    if (input.parentId) {
      const parent = await folderRepository.findById(tx, input.parentId);
      if (!parent) {
        throw new AppError(404, 'NOT_FOUND', 'Parent folder not found');
      }
    }

    const existing = await tx.folder.findFirst({
      where: {
        organizationId: orgId,
        parentId: input.parentId ?? null,
        name: { equals: input.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A folder with this name already exists here');
    }

    const folder = await folderRepository.create(tx, {
      name: input.name,
      parentId: input.parentId ?? null,
      organizationId: orgId,
      createdById: userId,
    });

    await this.auditService.record(tx, {
      action: 'FOLDER_CREATE',
      entityType: 'Folder',
      entityId: folder.id,
      organizationId: orgId,
      actorId: userId,
      metadata: { name: folder.name },
    });

    return folder;
  }

  async rename(
    tx: TenantTx,
    id: string,
    name: string,
    orgId: string,
    userId: string,
  ): Promise<Folder> {
    const folder = await this.getById(tx, id);

    const existing = await tx.folder.findFirst({
      where: {
        organizationId: orgId,
        parentId: folder.parentId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        id: { not: id },
      },
    });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A folder with this name already exists here');
    }

    const updated = await folderRepository.update(tx, id, { name });

    await this.auditService.record(tx, {
      action: 'FOLDER_UPDATE',
      entityType: 'Folder',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: { name },
    });

    return updated;
  }

  async softDelete(tx: TenantTx, id: string, orgId: string, userId: string): Promise<void> {
    await this.getById(tx, id);
    await folderRepository.softDelete(tx, id);

    await this.auditService.record(tx, {
      action: 'FOLDER_DELETE',
      entityType: 'Folder',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
    });
  }
}
