import { Router } from 'express';
import type { TagController } from '../controllers/tag.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';

export function tagsRouter(controller: TagController, env: Env, prisma: PrismaClient): Router {
  const router = Router();
  router.use(authenticate(env));
  router.use(tenantMiddleware(prisma));

  router.get('/', requirePermission('tag:read'), controller.list.bind(controller));
  router.post('/', requirePermission('tag:write'), controller.create.bind(controller));
  router.patch('/:id', requirePermission('tag:write'), controller.update.bind(controller));
  router.delete('/:id', requirePermission('tag:write'), controller.delete.bind(controller));

  return router;
}
