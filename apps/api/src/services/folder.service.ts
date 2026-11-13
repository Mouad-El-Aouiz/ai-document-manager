import type { Folder } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import { folderRepository } from '../repositories/folder.repository.js';

export interface FolderService {
  listAll(tx: TenantTx): Promise<Folder[]>;
}

export const folderService: FolderService = {
  listAll: (tx) => folderRepository.findAll(tx),
};
