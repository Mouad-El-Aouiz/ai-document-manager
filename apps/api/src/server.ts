import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp({ env });

const server = app.listen(env.PORT, () => {
  // Utilisation de String(env.PORT) pour satisfaire ESLint
  console.log(`🚀 API listening on port ${String(env.PORT)} in ${env.NODE_ENV} mode`);
});

const shutdown = (): void => {
  console.log('Shutting down...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
