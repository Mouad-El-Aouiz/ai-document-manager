import type { DocumentVersion, Prisma } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export interface DocumentVersionRepository {
  create(tx: TenantTx, data: Prisma.DocumentVersionUncheckedCreateInput): Promise<DocumentVersion>;
  findById(tx: TenantTx, id: string): Promise<DocumentVersion | null>;
  getNextVersionNumber(tx: TenantTx, documentId: string): Promise<number>;
  update(
    tx: TenantTx,
    id: string,
    data: Prisma.DocumentVersionUncheckedUpdateInput,
  ): Promise<DocumentVersion>;
}

export const documentVersionRepository: DocumentVersionRepository = {
  create: (tx, data) => tx.documentVersion.create({ data }),
  findById: (tx, id) => tx.documentVersion.findFirst({ where: { id } }),
  getNextVersionNumber: async (tx, documentId) => {
    const lastVersion = await tx.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    });
    return (lastVersion?.versionNumber ?? 0) + 1;
  },
  update: (tx, id, data) => tx.documentVersion.update({ where: { id }, data }),
};
