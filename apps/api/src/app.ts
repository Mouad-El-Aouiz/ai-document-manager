import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';
import type { Logger } from 'pino';
import { requestContext } from './middlewares/request-context.js';
import { errorHandler } from './middlewares/error-handler.js';
import { validate } from './middlewares/validate.js';
import { AppError } from './errors/AppError.js';
import { z } from 'zod';
import type { PrismaClient } from './infra/prisma.js';
import type { Redis } from './infra/redis.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { FolderController } from './controllers/folder.controller.js';
import { foldersRouter } from './routes/folders.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  // 1. Contexte & Logs
  app.use(requestContext());
  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    }),
  );

  // 2. Sécurité
  app.use(helmet());
  app.use(cors({ origin: deps.env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // 3. Health (AVANT tout middleware d'auth)
  app.use(healthRouter(deps.prisma, deps.redis));

  // 4. Services & Controllers
  // On instancie AuthService avec ses 3 arguments (prisma, env, logger)
  const authService = new AuthService(deps.prisma, deps.env, deps.logger);
  // On instancie AuthController avec ses 2 arguments (authService, env)
  const authController = new AuthController(authService, deps.env);

  // 5. Routes
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  // Routes d'authentification
  app.use('/api/v1/auth', authRouter(authController, deps.redis, deps.env));

  const folderController = new FolderController();
  app.use('/api/v1/folders', foldersRouter(folderController, deps.env, deps.prisma));

  // Route de test pour la validation (peut être supprimée plus tard)
  app.post(
    '/test-validation',
    validate({ body: z.object({ name: z.string().min(3) }) }),
    (req, res) => {
      // Cast explicite pour satisfaire ESLint (req.body est `any` par défaut dans Express)
      res.json({ received: req.body as unknown });
    },
  );

  // 6. 404 Handler
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });

  // 7. Error Handler global
  app.use(errorHandler(deps.logger));

  return app;
}
