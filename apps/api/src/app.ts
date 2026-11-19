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
import { createStorageProvider } from './infra/storage/index.js';

// Routes
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { foldersRouter } from './routes/folders.js';
import { documentsRouter } from './routes/documents.js';
import { tagsRouter } from './routes/tags.js';
import { docsRouter } from './routes/docs.js';
import { auditLogsRouter } from './routes/audit-logs.js';

// Controllers & Services
import { AuthController } from './controllers/auth.controller.js';
import { AuthService } from './services/auth.service.js';
import { AuditService } from './services/audit.service.js';
import { AuditQueryService } from './services/audit-query.service.js';
import { AuditController } from './controllers/audit.controller.js';
import { FolderService } from './services/folder.service.js';
import { FolderController } from './controllers/folder.controller.js';
import { DocumentService } from './services/document.service.js';
import { DocumentController } from './controllers/document.controller.js';
import { DocumentUploadService } from './services/document-upload.service.js';
import { DocumentUploadController } from './controllers/document-upload.controller.js';
import { DocumentVersionService } from './services/document-version.service.js';
import { DocumentVersionController } from './controllers/document-version.controller.js';
import { TagService } from './services/tag.service.js';
import { TagController } from './controllers/tag.controller.js';

// Repositories
import { documentRepository } from './repositories/document.repository.js';
import { documentVersionRepository } from './repositories/document-version.repository.js';

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

  // 2. Sécurité (avec CSP relaxé en dev pour Swagger)
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

  // 3. Services & Controllers
  const storage = createStorageProvider(deps.env);
  const auditService = new AuditService(deps.prisma, deps.logger);
  const auditQueryService = new AuditQueryService();
  const authService = new AuthService(deps.prisma, deps.env, deps.logger);

  const authController = new AuthController(authService, deps.env);
  const auditController = new AuditController(auditQueryService);
  const folderController = new FolderController(new FolderService(auditService));

  const uploadService = new DocumentUploadService(
    documentRepository,
    documentVersionRepository,
    storage,
    auditService,
    deps.env,
  );
  const uploadController = new DocumentUploadController(uploadService);
  const documentController = new DocumentController(new DocumentService(storage, auditService));
  const versionService = new DocumentVersionService(storage, auditService, uploadService);
  const versionController = new DocumentVersionController(uploadService, versionService);
  const tagController = new TagController(new TagService(auditService));

  // 4. Routes publiques (Health & Docs)
  app.use(healthRouter(deps.prisma, deps.redis));
  app.use('/api/v1/docs', docsRouter(deps.env)); // ATTENTION : si ton docsRouter gère déjà /docs, adapte le path

  // 5. Routes métier
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  app.use('/api/v1/auth', authRouter(authController, deps.redis, deps.env));
  app.use('/api/v1/folders', foldersRouter(folderController, deps.env, deps.prisma));
  app.use(
    '/api/v1/documents',
    documentsRouter(uploadController, documentController, versionController, deps.env, deps.prisma),
  );
  app.use('/api/v1/tags', tagsRouter(tagController, deps.env, deps.prisma));
  app.use('/api/v1/audit-logs', auditLogsRouter(auditController, deps.env, deps.prisma));

  // 6. Route de test pour validation (existant)
  app.post(
    '/test-validation',
    validate({ body: z.object({ name: z.string().min(3) }) }),
    (req, res) => {
      const body = req.body as { name: string };
      res.json({ received: body });
    },
  );

  // 7. 404 Handler
  app.use((_req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', 'Route not found'));
  });

  // 8. Error Handler global
  app.use(errorHandler(deps.logger));

  return app;
}
