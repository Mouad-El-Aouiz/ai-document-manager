import { Router } from 'express';
import type { DocumentUploadController } from '../controllers/document-upload.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';

export function documentsRouter(
  uploadController: DocumentUploadController,
  env: Env,
  prisma: PrismaClient,
): Router {
  const router = Router();
  router.use(authenticate(env));
  router.use(tenantMiddleware(prisma));

  router.post(
    '/uploads',
    requirePermission('document:write'),
    uploadController.init.bind(uploadController),
  );

  router.post(
    '/uploads/:versionId/complete',
    requirePermission('document:write'),
    uploadController.complete.bind(uploadController),
  );

  return router;
}
