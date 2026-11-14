import { Router } from 'express';
import type { FolderController } from '../controllers/folder.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { z } from 'zod';

const folderParamsSchema = z.object({
  id: z.string().uuid(),
});

export function foldersRouter(
  controller: FolderController,
  env: Env,
  prisma: PrismaClient,
): Router {
  const router = Router();
  router.use(authenticate(env));
  router.use(tenantMiddleware(prisma));

  router.get('/', requirePermission('folder:read'), controller.list.bind(controller));
  router.get(
    '/:id',
    requirePermission('folder:read'),
    validate({ params: folderParamsSchema }),
    controller.get.bind(controller),
  );
  router.post('/', requirePermission('folder:create'), controller.create.bind(controller));
  router.patch(
    '/:id',
    requirePermission('folder:update'),
    validate({ params: folderParamsSchema }),
    controller.update.bind(controller),
  );
  router.delete(
    '/:id',
    requirePermission('folder:delete'),
    validate({ params: folderParamsSchema }),
    controller.delete.bind(controller),
  );

  return router;
}
