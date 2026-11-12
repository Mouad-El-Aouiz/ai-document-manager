import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './infra/logger.js';

const env = loadEnv();
const logger = createLogger(env);
const app = createApp({ env, logger });

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 API listening on port ${String(env.PORT)} in ${env.NODE_ENV} mode`);
});

const shutdown = (): void => {
  logger.info('Shutting down...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
