import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../infra/prisma.js';
import { withTenant, type TenantTx } from '@aidm/shared';
import { AppError } from '../errors/AppError.js';

export function tenantMiddleware(prisma: PrismaClient) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    const organizationId = req.auth.org;

    req.withTenant = <T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> =>
      withTenant(prisma, organizationId, fn);

    next();
  };
}
