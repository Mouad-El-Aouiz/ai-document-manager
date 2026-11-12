import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import type { Logger } from 'pino';
import { requestContext } from './middlewares/request-context.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  // 1. Contexte de requête (request_id) DOIT être en premier
  app.use(requestContext());

  // 2. Logger HTTP (utilise l'AsyncLocalStorage mis en place juste avant)
  app.use(
    pinoHttp({
      logger: deps.logger,
      // On n'auto-log pas les healthchecks pour ne pas polluer les logs
      autoLogging: {
        ignore: (req) => req.url.startsWith('/health'),
      },
    }),
  );

  // 3. Body parser
  app.use(express.json());

  // Route de test temporaire
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  return app;
}
