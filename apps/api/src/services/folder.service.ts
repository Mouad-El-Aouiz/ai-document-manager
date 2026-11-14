import type { Folder } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import { folderRepository, type BreadcrumbRow } from '../repositories/folder.repository.js';
import { AppError } from '../errors/AppError.js';
import type { AuditService } from './audit.service.js';

export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
}

export class FolderService {
  constructor(private readonly auditService: AuditService) {}

  async listAll(tx: TenantTx, parentId?: string | null): Promise<Folder[]> {
    return folderRepository.findAll(tx, parentId);
  }

  async getById(tx: TenantTx, id: string): Promise<Folder> {
    const folder = await folderRepository.findById(tx, id);
    if (!folder) {
      throw new AppError(404, 'NOT_FOUND', 'Folder not found');
    }
    return folder;
  }

  async getBreadcrumb(tx: TenantTx, id: string): Promise<BreadcrumbRow[]> {
    await this.getById(tx, id);
    return folderRepository.getBreadcrumb(tx, id);
  }

  async create(
    tx: TenantTx,
    input: CreateFolderInput,
    orgId: string,
    userId: string,
  ): Promise<Folder> {
    if (input.parentId) {
      const parentId: string = input.parentId;
      const parent = await folderRepository.findById(tx, parentId);
      if (!parent) {
        throw new AppError(404, 'NOT_FOUND', 'Parent folder not found');
      }

      const parentBreadcrumb = await folderRepository.getBreadcrumb(tx, parentId);
      if (parentBreadcrumb.length > 10) {
        throw new AppError(400, 'BAD_REQUEST', 'Maximum folder depth exceeded');
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

  async move(
    tx: TenantTx,
    id: string,
    newParentId: string | null,
    orgId: string,
    userId: string,
  ): Promise<Folder> {
    await folderRepository.lockFolder(tx, id);
    const folder = await this.getById(tx, id);

    if (newParentId === id) {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot move a folder into itself');
    }

    if (newParentId !== null) {
      const parentId: string = newParentId;
      const newParent = await folderRepository.findById(tx, parentId);
      if (!newParent) {
        throw new AppError(404, 'NOT_FOUND', 'New parent folder not found');
      }

      const isCycle = await folderRepository.isDescendant(tx, id, parentId);
      if (isCycle) {
        throw new AppError(400, 'BAD_REQUEST', 'Cannot move a folder into its own descendant');
      }

      const maxSubtreeDepth = await folderRepository.getMaxSubtreeDepth(tx, id);
      const parentBreadcrumb = await folderRepository.getBreadcrumb(tx, parentId);
      const newParentDepth = parentBreadcrumb.length;

      if (newParentDepth + 1 + maxSubtreeDepth > 10) {
        throw new AppError(400, 'BAD_REQUEST', 'Maximum folder depth exceeded');
      }
    }

    const existing = await tx.folder.findFirst({
      where: {
        organizationId: orgId,
        parentId: newParentId,
        name: { equals: folder.name, mode: 'insensitive' },
        deletedAt: null,
        id: { not: id },
      },
    });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A folder with this name already exists here');
    }

    const updated = await folderRepository.update(tx, id, { parentId: newParentId });

    await this.auditService.record(tx, {
      action: 'FOLDER_MOVE',
      entityType: 'Folder',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
      metadata: { from: folder.parentId, to: newParentId },
    });

    return updated;
  }

  async softDelete(tx: TenantTx, id: string, orgId: string, userId: string): Promise<void> {
    await this.getById(tx, id);
    await folderRepository.cascadeSoftDelete(tx, id);

    await this.auditService.record(tx, {
      action: 'FOLDER_DELETE',
      entityType: 'Folder',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
    });
  }
}
