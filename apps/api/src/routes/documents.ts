import { Router } from 'express';
import type { DocumentUploadController } from '../controllers/document-upload.controller.js';
import type { DocumentController } from '../controllers/document.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';

export function documentsRouter(
  uploadController: DocumentUploadController,
  documentController: DocumentController,
  env: Env,
  prisma: PrismaClient,
): Router {
  const router = Router();
  router.use(authenticate(env));
  router.use(tenantMiddleware(prisma));

  // Upload (5.5)
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

  // CRUD (5.6)
  router.get(
    '/',
    requirePermission('document:read'),
    documentController.list.bind(documentController),
  );
  router.get(
    '/:id',
    requirePermission('document:read'),
    documentController.get.bind(documentController),
  );
  router.get(
    '/:id/download',
    requirePermission('document:read'),
    documentController.download.bind(documentController),
  );
  router.patch(
    '/:id',
    requirePermission('document:write'),
    documentController.update.bind(documentController),
  );
  router.delete(
    '/:id',
    requirePermission('document:delete'),
    documentController.delete.bind(documentController),
  );

  return router;
}
