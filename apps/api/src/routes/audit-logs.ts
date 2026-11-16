import { Router } from 'express';
import type { AuditController } from '../controllers/audit.controller.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../infra/prisma.js';
import { authenticate } from '../middlewares/authenticate.js';
import { tenantMiddleware } from '../middlewares/tenant.middleware.js';
import { requirePermission } from '../middlewares/rbac.js';

export function auditLogsRouter(
  controller: AuditController,
  env: Env,
  prisma: PrismaClient,
): Router {
  const router = Router();
  router.use(authenticate(env));
  router.use(tenantMiddleware(prisma));

  router.get('/', requirePermission('audit:read'), controller.list.bind(controller));

  return router;
}
