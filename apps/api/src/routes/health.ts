import { Router } from 'express';
import type { PrismaClient } from '../infra/prisma.js';
import type { Redis } from '../infra/redis.js';

interface HealthCheckResult {
  db: 'up' | 'down';
  redis: 'up' | 'down';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function healthRouter(prisma: PrismaClient, redis: Redis): Router {
  const router = Router();

  router.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/health', async (_req, res) => {
    const checks: HealthCheckResult = { db: 'down', redis: 'down' };

    const results = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`, 2000),
      withTimeout(redis.ping(), 2000),
    ]);

    if (results[0].status === 'fulfilled') checks.db = 'up';
    if (results[1].status === 'fulfilled') checks.redis = 'up';

    const isHealthy = checks.db === 'up' && checks.redis === 'up';

    if (isHealthy) {
      res.status(200).json({ status: 'ok', checks });
    } else {
      res.status(503).json({ status: 'error', checks });
    }
  });

  return router;
}
