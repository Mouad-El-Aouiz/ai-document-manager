import type { PrismaClient } from '@prisma/client';
import type { WorkerStorage } from '../infra/storage.js';
import { withTenant } from '@aidm/shared';

export interface CleanupPendingUploadsDeps {
  prisma: PrismaClient;
  storage: WorkerStorage;
  ttlHours: number;
  now?: () => Date;
}

export async function cleanupPendingUploads(
  deps: CleanupPendingUploadsDeps,
): Promise<{ deleted: number }> {
  const now = deps.now ?? (() => new Date());
  const threshold = new Date(now().getTime() - deps.ttlHours * 3600 * 1000);

  const organizations = await deps.prisma.organization.findMany({ select: { id: true } });
  let deleted = 0;

  for (const org of organizations) {
    const stale = await withTenant(deps.prisma, org.id, (tx) =>
      tx.documentVersion.findMany({
        where: { status: 'PENDING_UPLOAD', createdAt: { lt: threshold } },
        select: { id: true, storageKey: true, documentId: true },
      }),
    );

    if (stale.length === 0) continue;

    // Suppression S3 d'abord (hors transaction)
    await deps.storage.deleteMany(stale.map((v) => v.storageKey));

    // Puis suppression en base
    await withTenant(deps.prisma, org.id, async (tx) => {
      const versionIds = stale.map((v) => v.id);
      await tx.documentVersion.deleteMany({ where: { id: { in: versionIds } } });

      // Si un document n'a plus aucune version, on le soft-delete
      const docIds = Array.from(new Set(stale.map((v) => v.documentId)));
      for (const docId of docIds) {
        const count = await tx.documentVersion.count({ where: { documentId: docId } });
        if (count === 0) {
          await tx.document.update({
            where: { id: docId },
            data: { deletedAt: new Date() },
          });
        }
      }
    });

    deleted += stale.length;
  }

  return { deleted };
}
