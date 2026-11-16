import type { Tag, Prisma } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export interface TagRepository {
  findAll(tx: TenantTx): Promise<Tag[]>;
  findById(tx: TenantTx, id: string): Promise<Tag | null>;
  findByIds(tx: TenantTx, ids: string[]): Promise<Tag[]>;
  create(tx: TenantTx, data: Prisma.TagUncheckedCreateInput): Promise<Tag>;
  update(tx: TenantTx, id: string, data: Prisma.TagUncheckedUpdateInput): Promise<Tag>;
  delete(tx: TenantTx, id: string): Promise<void>;
}

export const tagRepository: TagRepository = {
  findAll: (tx) => tx.tag.findMany({ orderBy: { name: 'asc' } }),
  findById: (tx, id) => tx.tag.findUnique({ where: { id } }),
  findByIds: (tx, ids) => tx.tag.findMany({ where: { id: { in: ids } } }),
  create: (tx, data) => tx.tag.create({ data }),
  update: (tx, id, data) => tx.tag.update({ where: { id }, data }),
  delete: async (tx, id) => { await tx.tag.delete({ where: { id } }); },
};