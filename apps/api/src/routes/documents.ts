import { Router } from 'express';
import type { DocumentUploadController } from '../controllers/document-upload.controller.js';
import type { DocumentController } from '../controllers/document.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';
import type { DocumentVersionController } from '../controllers/document-version.controller.js';

export function documentsRouter(
  uploadController: DocumentUploadController,
  documentController: DocumentController,
  versionController: DocumentVersionController,
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
  router.patch(
    '/:id/metadata',
    requirePermission('document:write'),
    documentController.updateMetadata.bind(documentController),
  );
  router.put(
    '/:id/tags',
    requirePermission('document:write'),
    documentController.updateTags.bind(documentController),
  );
  router.post(
    '/:id/versions',
    requirePermission('document:write'),
    versionController.init.bind(versionController),
  );
  router.post(
    '/:id/versions/:versionId/complete',
    requirePermission('document:write'),
    versionController.complete.bind(versionController),
  );
  router.get(
    '/:id/versions',
    requirePermission('document:read'),
    versionController.list.bind(versionController),
  );
  router.get(
    '/:id/versions/:versionId/download',
    requirePermission('document:read'),
    versionController.download.bind(versionController),
  );
  router.post(
    '/:id/versions/:versionId/restore',
    requirePermission('document:write'),
    versionController.restore.bind(versionController),
  );

  return router;
}
