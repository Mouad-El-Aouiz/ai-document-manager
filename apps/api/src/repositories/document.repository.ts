import type { Document, Prisma } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export interface DocumentRepository {
  create(tx: TenantTx, data: Prisma.DocumentUncheckedCreateInput): Promise<Document>;
  findById(tx: TenantTx, id: string): Promise<Document | null>;
  lockDocument(tx: TenantTx, id: string): Promise<void>;
  update(tx: TenantTx, id: string, data: Prisma.DocumentUncheckedUpdateInput): Promise<Document>;
}

export const documentRepository: DocumentRepository = {
  create: (tx, data) => tx.document.create({ data }),
  findById: (tx, id) => tx.document.findFirst({ where: { id, deletedAt: null } }),
  lockDocument: async (tx, id) => {
    await tx.$executeRaw`SELECT 1 FROM "Document" WHERE id = ${id} FOR UPDATE`;
  },
  update: (tx, id, data) => tx.document.update({ where: { id }, data }),
};
