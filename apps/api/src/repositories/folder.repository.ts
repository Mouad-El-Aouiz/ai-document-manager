import type { Folder, Prisma } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export interface FindAllOptions {
  parentId?: string | null | undefined;
}

export interface FolderRepository {
  findAll(tx: TenantTx, options: FindAllOptions): Promise<Folder[]>;
  findById(tx: TenantTx, id: string): Promise<Folder | null>;
  create(tx: TenantTx, data: Prisma.FolderUncheckedCreateInput): Promise<Folder>;
  update(tx: TenantTx, id: string, data: Prisma.FolderUncheckedUpdateInput): Promise<Folder>;
  softDelete(tx: TenantTx, id: string): Promise<void>;
}

export const folderRepository: FolderRepository = {
  findAll: (tx, options) =>
    tx.folder.findMany({
      where: {
        deletedAt: null,
        ...(options.parentId !== undefined ? { parentId: options.parentId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    }),

  findById: (tx, id) =>
    tx.folder.findFirst({
      where: { id, deletedAt: null },
    }),

  create: (tx, data) => tx.folder.create({ data }),

  update: (tx, id, data) =>
    tx.folder.update({
      where: { id },
      data,
    }),

  softDelete: async (tx, id) => {
    await tx.folder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },
};
