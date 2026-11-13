import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import helmet from 'helmet';
import cors from 'cors';
import type { Env } from './config/env.js';
import type { Logger } from 'pino';
import { requestContext } from './middlewares/request-context.js';
import { errorHandler } from './middlewares/error-handler.js';
import { validate } from './middlewares/validate.js';
import { z } from 'zod';
import { AppError } from './errors/AppError.js';
import type { PrismaClient } from './infra/prisma.js';
import type { Redis } from './infra/redis.js';
import { healthRouter } from './routes/health.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
}

const testSchema = z.object({
  name: z.string().min(3),
});

export function createApp(deps: AppDependencies): Express {
  const app = express();

  // 1. Contexte
  app.use(requestContext());
  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    }),
  );

  // 2. Sécurité
  app.use(helmet());
  app.use(cors({ origin: deps.env.CORS_ORIGINS }));
  app.use(express.json({ limit: '1mb' }));

  // Health (AVANT tout middleware d'auth futur)
  app.use(healthRouter(deps.prisma, deps.redis));

  // 3. Routes
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  // Route de test pour la validation
  app.post(
    '/test-validation',
    validate({
      body: testSchema,
    }),
    (req, res) => {
      // On cast le body avec le type inféré par Zod, ce qui supprime le "any"
      const body = req.body as z.infer<typeof testSchema>;
      res.json({ received: body });
    },
  );

  // 4. 404 Handler
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });

  // 5. Error Handler global
  app.use(errorHandler(deps.logger));

  return app;
}
