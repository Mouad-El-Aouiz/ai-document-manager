import { createServer, type Server } from 'node:http';
import { Worker } from 'bullmq';
import pino from 'pino';
import { loadEnv } from './config/env.js';
import { createWorkerPrisma } from './infra/prisma.js';
import { createWorkerRedis } from './infra/redis.js';
import { createWorkerStorage } from './infra/storage.js';
import { createMaintenanceQueue, QUEUE_MAINTENANCE } from './queues.js';
import { scheduleJobs } from './scheduler.js';
import { cleanupPendingUploads } from './jobs/cleanup-pending-uploads.js';
import { purgeDeletedItems } from './jobs/purge-deleted-items.js';
import { purgeOldVersions } from './jobs/purge-old-versions.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL });

  const prisma = createWorkerPrisma();
  const redis = createWorkerRedis(env.REDIS_URL);
  const storage = createWorkerStorage(env);

  const queue = createMaintenanceQueue(redis);
  await scheduleJobs(queue);

  const worker = new Worker(
    QUEUE_MAINTENANCE,
    async (job) => {
      logger.info({ job: job.name }, 'Job started');
      switch (job.name) {
        case 'cleanup-pending-uploads':
          return cleanupPendingUploads({
            prisma,
            storage,
            ttlHours: env.PENDING_UPLOAD_TTL_HOURS,
          });
        case 'purge-deleted-items':
          return purgeDeletedItems({
            prisma,
            storage,
            retentionDays: env.SOFT_DELETE_RETENTION_DAYS,
          });
        case 'purge-old-versions':
          return purgeOldVersions({
            prisma,
            storage,
            retentionByPlan: {
              FREE: env.RETENTION_FREE_VERSIONS,
              PRO: env.RETENTION_PRO_VERSIONS,
              ENTERPRISE: env.RETENTION_ENTERPRISE_VERSIONS,
            },
          });
        default:
          logger.warn({ job: job.name }, 'Unknown job');
          return null;
      }
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('completed', (job, result) => {
    logger.info({ job: job.name, result }, 'Job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, err }, 'Job failed');
  });

  // ── Healthcheck HTTP minimal (Docker HEALTHCHECK) ──
  const healthServer: Server = createServer((req, res) => {
    if (req.url === '/health/live' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(3001, () => {
    logger.info('Worker healthcheck listening on port 3001');
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Worker shutting down...');
    await new Promise<void>((resolve) => {
      healthServer.close(() => {
        resolve();
      });
    });
    await worker.close();
    await queue.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });

  logger.info('Worker started, waiting for jobs...');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
