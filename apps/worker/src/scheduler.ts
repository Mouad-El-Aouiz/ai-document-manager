import type { Queue } from 'bullmq';

export async function scheduleJobs(queue: Queue): Promise<void> {
  // Nettoyage PENDING_UPLOAD : toutes les 6h
  await queue.add(
    'cleanup-pending-uploads',
    {},
    { repeat: { pattern: '0 */6 * * *' }, jobId: 'cleanup-pending-uploads' },
  );

  // Purge soft-deleted : 1x par jour à 3h du matin
  await queue.add(
    'purge-deleted-items',
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'purge-deleted-items' },
  );

  // Purge versions hors rétention : 1x par jour à 4h du matin
  await queue.add(
    'purge-old-versions',
    {},
    { repeat: { pattern: '0 4 * * *' }, jobId: 'purge-old-versions' },
  );
}
