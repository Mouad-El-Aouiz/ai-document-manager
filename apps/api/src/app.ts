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
import { FolderService } from './services/folder.service.js';
import { AuditService } from './services/audit.service.js';
import { foldersRouter } from './routes/folders.js';
import { docsRouter } from './routes/docs.js';

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
  app.use(
    helmet({
      contentSecurityPolicy:
        deps.env.NODE_ENV === 'production'
          ? true
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
                imgSrc: ["'self'", 'data:', 'https://unpkg.com'],
                connectSrc: ["'self'", 'https://unpkg.com'],
              },
            },
    }),
  );
  app.use(cors({ origin: deps.env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // 3. Health
  app.use(healthRouter(deps.prisma, deps.redis));

  // 4. Services & Controllers
  const authService = new AuthService(deps.prisma, deps.env, deps.logger);
  const authController = new AuthController(authService, deps.env);

  const auditService = new AuditService(deps.prisma, deps.logger);
  const folderService = new FolderService(auditService);
  const folderController = new FolderController(folderService);

  // 5. Routes
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  app.post(
    '/test-validation',
    validate({ body: z.object({ name: z.string().min(3) }) }),
    (req, res) => {
      // Le middleware `validate` a déjà parsé et remplacé req.body par un objet typé.
      // On cast pour satisfaire ESLint (req.body est typé any dans les types Express).
      const body = req.body as { name: string };
      res.json({ received: body });
    },
  );

  app.use('/api/v1/auth', authRouter(authController, deps.redis, deps.env));
  app.use('/api/v1/folders', foldersRouter(folderController, deps.env, deps.prisma));
  app.use('/api/v1', docsRouter(deps.env));

  // 6. 404 Handler
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });

  // 7. Error Handler
  app.use(errorHandler(deps.logger));

  return app;
}
