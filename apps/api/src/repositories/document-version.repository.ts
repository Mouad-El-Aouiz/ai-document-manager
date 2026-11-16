import type { DocumentVersion, Prisma } from '@prisma/client';
import type { TenantTx } from '@aidm/shared';

export interface DocumentVersionRepository {
  create(tx: TenantTx, data: Prisma.DocumentVersionUncheckedCreateInput): Promise<DocumentVersion>;
  findById(tx: TenantTx, id: string): Promise<DocumentVersion | null>;
  getNextVersionNumber(tx: TenantTx, documentId: string): Promise<number>;
  update(
    tx: TenantTx,
    id: string,
    data: Prisma.DocumentVersionUncheckedUpdateInput,
  ): Promise<DocumentVersion>;
  findByDocument(tx: TenantTx, documentId: string): Promise<DocumentVersion[]>;
  countByDocument(tx: TenantTx, documentId: string): Promise<number>;
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
  findByDocument: (tx, documentId) =>
    tx.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    }),

  countByDocument: (tx, documentId) => tx.documentVersion.count({ where: { documentId } }),
};
