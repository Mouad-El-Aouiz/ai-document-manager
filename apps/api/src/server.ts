import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './infra/logger.js';
import { createPrismaClient } from './infra/prisma.js';
import { createRedisClient } from './infra/redis.js';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrismaClient();
const redis = createRedisClient(env.REDIS_URL);

const app = createApp({ env, logger, prisma, redis });

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 API listening on port ${String(env.PORT)} in ${env.NODE_ENV} mode`);
});

const shutdown = (): void => {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    void Promise.all([prisma.$disconnect(), redis.quit()])
      .then(() => {
        logger.info('Connections closed. Exiting.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      });
  });

  // Timeout de secours (10s) si les connexions ne se ferment pas
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
