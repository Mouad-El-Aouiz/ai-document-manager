import type { Folder, Prisma } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import { z } from 'zod';

const BreadcrumbRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  level: z.number(),
});

export type BreadcrumbRow = z.infer<typeof BreadcrumbRowSchema>;

export interface FolderRepository {
  findAll(tx: TenantTx, parentId?: string | null): Promise<Folder[]>;
  findById(tx: TenantTx, id: string): Promise<Folder | null>;
  create(tx: TenantTx, data: Prisma.FolderUncheckedCreateInput): Promise<Folder>;
  update(tx: TenantTx, id: string, data: Prisma.FolderUncheckedUpdateInput): Promise<Folder>;
  softDelete(tx: TenantTx, id: string): Promise<void>;
  lockFolder(tx: TenantTx, id: string): Promise<void>;
  getBreadcrumb(tx: TenantTx, id: string): Promise<BreadcrumbRow[]>;
  getMaxSubtreeDepth(tx: TenantTx, id: string): Promise<number>;
  isDescendant(tx: TenantTx, ancestorId: string, potentialDescendantId: string): Promise<boolean>;
  cascadeSoftDelete(tx: TenantTx, id: string): Promise<void>;
}

export const folderRepository: FolderRepository = {
  findAll: (tx, parentId) => {
    const where: Prisma.FolderWhereInput = { deletedAt: null };
    if (parentId !== undefined) {
      where.parentId = parentId;
    }
    return tx.folder.findMany({ where, orderBy: { createdAt: 'asc' } });
  },

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

  lockFolder: async (tx, id) => {
    await tx.$executeRaw`SELECT 1 FROM "Folder" WHERE id = ${id} FOR UPDATE`;
  },

  getBreadcrumb: async (tx, id) => {
    const rows = await tx.$queryRaw<unknown[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, "parentId", 0 AS level
        FROM "Folder"
        WHERE id = ${id} AND "deletedAt" IS NULL
        
        UNION ALL
        
        SELECT f.id, f.name, f."parentId", a.level + 1
        FROM "Folder" f
        INNER JOIN ancestors a ON f.id = a."parentId"
        WHERE f."deletedAt" IS NULL
      )
      SELECT id, name, "parentId", level
      FROM ancestors
      ORDER BY level DESC;
    `;
    return z.array(BreadcrumbRowSchema).parse(rows);
  },

  getMaxSubtreeDepth: async (tx, id) => {
    const result = await tx.$queryRaw<{ max_depth: number }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id, 0 AS depth
        FROM "Folder"
        WHERE id = ${id} AND "deletedAt" IS NULL
        
        UNION ALL
        
        SELECT f.id, d.depth + 1
        FROM "Folder" f
        INNER JOIN descendants d ON f."parentId" = d.id
        WHERE f."deletedAt" IS NULL
      )
      SELECT COALESCE(MAX(depth), 0)::int AS max_depth FROM descendants;
    `;
    return result[0]?.max_depth ?? 0;
  },

  isDescendant: async (tx, ancestorId, potentialDescendantId) => {
    const result = await tx.$queryRaw<{ exists: boolean }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Folder" WHERE id = ${ancestorId} AND "deletedAt" IS NULL
        UNION ALL
        SELECT f.id FROM "Folder" f INNER JOIN descendants d ON f."parentId" = d.id WHERE f."deletedAt" IS NULL
      )
      SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ${potentialDescendantId}) AS exists;
    `;
    return result[0]?.exists ?? false;
  },

  cascadeSoftDelete: async (tx, id) => {
    await tx.$executeRaw`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Folder" WHERE id = ${id} AND "deletedAt" IS NULL
        UNION ALL
        SELECT f.id FROM "Folder" f INNER JOIN descendants d ON f."parentId" = d.id WHERE f."deletedAt" IS NULL
      )
      UPDATE "Document"
      SET "deletedAt" = NOW()
      WHERE "folderId" IN (SELECT id FROM descendants) AND "deletedAt" IS NULL;
    `;

    await tx.$executeRaw`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Folder" WHERE id = ${id} AND "deletedAt" IS NULL
        UNION ALL
        SELECT f.id FROM "Folder" f INNER JOIN descendants d ON f."parentId" = d.id WHERE f."deletedAt" IS NULL
      )
      UPDATE "Folder"
      SET "deletedAt" = NOW()
      WHERE id IN (SELECT id FROM descendants);
    `;
  },
};
