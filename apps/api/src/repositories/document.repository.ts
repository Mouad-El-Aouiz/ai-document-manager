import { Prisma } from '@prisma/client';
import type { Document } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';

export type DocumentWithCurrentVersion = Prisma.DocumentGetPayload<{
  include: { currentVersion: true; tags: { include: { tag: true } } };
}>;

export interface ListOptions {
  cursor?: string | undefined;
  limit: number;
  folderId?: string | null | undefined;
  q?: string | undefined;
  tagName?: string | undefined;
}

export interface DocumentRepository {
  create(tx: TenantTx, data: Prisma.DocumentUncheckedCreateInput): Promise<Document>;
  findById(tx: TenantTx, id: string): Promise<Document | null>;
  findByIdWithVersion(tx: TenantTx, id: string): Promise<DocumentWithCurrentVersion | null>;
  findAll(tx: TenantTx, options: ListOptions): Promise<DocumentWithCurrentVersion[]>;
  update(tx: TenantTx, id: string, data: Prisma.DocumentUncheckedUpdateInput): Promise<Document>;
  softDelete(tx: TenantTx, id: string): Promise<void>;
  lockDocument(tx: TenantTx, id: string): Promise<void>;
}

export const documentRepository: DocumentRepository = {
  create: (tx, data) => tx.document.create({ data }),

  findById: (tx, id) => tx.document.findFirst({ where: { id, deletedAt: null } }),

  findByIdWithVersion: (tx, id) =>
    tx.document.findFirst({
      where: { id, deletedAt: null },
      include: { currentVersion: true, tags: { include: { tag: true } } },
    }),

  findAll: async (tx, options) => {
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      currentVersionId: { not: null },
    };
    if (options.folderId !== undefined) where.folderId = options.folderId;
    if (options.q !== undefined) where.name = { contains: options.q, mode: 'insensitive' };
    if (options.tagName !== undefined) where.tags = { some: { tag: { name: options.tagName } } };

    try {
      return await tx.document.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: options.limit + 1,
        ...(options.cursor !== undefined ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        include: { currentVersion: true, tags: { include: { tag: true } } },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        return [];
      throw error;
    }
  },

  update: (tx, id, data) => tx.document.update({ where: { id }, data }),

  softDelete: async (tx, id) => {
    await tx.document.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  lockDocument: async (tx, id) => {
    await tx.$executeRaw`SELECT 1 FROM "Document" WHERE id = ${id} FOR UPDATE`;
  },
};
