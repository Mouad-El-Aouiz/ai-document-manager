import type { Folder } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export interface FolderRepository {
  findAll(tx: TenantTx): Promise<Folder[]>;
}

export const folderRepository: FolderRepository = {
  findAll: (tx) => tx.folder.findMany({ orderBy: { createdAt: 'asc' } }),
};