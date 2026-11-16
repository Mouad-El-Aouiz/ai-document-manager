import type { PrismaClient, OrganizationPlan } from '@prisma/client';
import type { WorkerStorage } from '../infra/storage.js';
import { withTenant } from '@aidm/shared';

export interface PurgeOldVersionsDeps {
  prisma: PrismaClient;
  storage: WorkerStorage;
  retentionByPlan: Record<OrganizationPlan, number>;
}

export async function purgeOldVersions(deps: PurgeOldVersionsDeps): Promise<{ deleted: number }> {
  const organizations = await deps.prisma.organization.findMany({
    select: { id: true, plan: true },
  });
  let deleted = 0;

  for (const org of organizations) {
    const limit = deps.retentionByPlan[org.plan];

    // Récupérer tous les documents avec plus de `limit` versions
    const documents = await withTenant(deps.prisma, org.id, (tx) =>
      tx.document.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          currentVersionId: true,
          versions: {
            select: { id: true, versionNumber: true, storageKey: true },
            orderBy: { versionNumber: 'desc' },
          },
        },
      }),
    );

    for (const doc of documents) {
      if (doc.versions.length <= limit) continue;

      // Garder les `limit` plus récentes + la version courante (si ce n'est pas déjà dedans)
      const toKeep = doc.versions.slice(0, limit).map((v) => v.id);
      if (doc.currentVersionId && !toKeep.includes(doc.currentVersionId)) {
        toKeep.push(doc.currentVersionId);
      }
      const toDelete = doc.versions.filter((v) => !toKeep.includes(v.id));
      if (toDelete.length === 0) continue;

      await deps.storage.deleteMany(toDelete.map((v) => v.storageKey));
      await withTenant(deps.prisma, org.id, async (tx) => {
        await tx.documentVersion.deleteMany({ where: { id: { in: toDelete.map((v) => v.id) } } });
      });
      deleted += toDelete.length;
    }
  }

  return { deleted };
}
