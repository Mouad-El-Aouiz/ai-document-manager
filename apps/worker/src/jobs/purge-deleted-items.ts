import type { PrismaClient } from '@prisma/client';
import type { WorkerStorage } from '../infra/storage.js';
import { withTenant } from '@aidm/shared';

export interface PurgeDeletedItemsDeps {
  prisma: PrismaClient;
  storage: WorkerStorage;
  retentionDays: number;
  now?: () => Date;
}

export async function purgeDeletedItems(
  deps: PurgeDeletedItemsDeps,
): Promise<{ documents: number; folders: number }> {
  const now = deps.now ?? (() => new Date());
  const threshold = new Date(now().getTime() - deps.retentionDays * 86400 * 1000);

  const organizations = await deps.prisma.organization.findMany({ select: { id: true } });
  let documents = 0;
  let folders = 0;

  for (const org of organizations) {
    // 1. Documents soft-deleted à purger
    const docsToPurge = await withTenant(deps.prisma, org.id, (tx) =>
      tx.document.findMany({
        where: { deletedAt: { lt: threshold } },
        select: {
          id: true,
          versions: { select: { storageKey: true } },
        },
      }),
    );

    if (docsToPurge.length > 0) {
      // S3 d'abord (hors transaction)
      const allKeys = docsToPurge.flatMap((d) => d.versions.map((v) => v.storageKey));
      await deps.storage.deleteMany(allKeys);

      // Puis hard delete en base
      await withTenant(deps.prisma, org.id, async (tx) => {
        const ids = docsToPurge.map((d) => d.id);
        await tx.documentVersion.deleteMany({ where: { documentId: { in: ids } } });
        await tx.documentTag.deleteMany({ where: { documentId: { in: ids } } });
        await tx.document.deleteMany({ where: { id: { in: ids } } });
      });
      documents += docsToPurge.length;
    }

    // 2. Dossiers soft-deleted à purger
    const foldersToPurge = await withTenant(deps.prisma, org.id, (tx) =>
      tx.folder.findMany({
        where: { deletedAt: { lt: threshold } },
        select: { id: true },
      }),
    );

    if (foldersToPurge.length > 0) {
      await withTenant(deps.prisma, org.id, async (tx) => {
        const ids = foldersToPurge.map((f) => f.id);
        await tx.folder.deleteMany({ where: { id: { in: ids } } });
      });
      folders += foldersToPurge.length;
    }
  }

  return { documents, folders };
}
