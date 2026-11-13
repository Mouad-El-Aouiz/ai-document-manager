import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../infra/prisma.js';
import { withTenant, type TenantTx } from '../db/with-tenant.js';
import { AppError } from '../errors/AppError.js';

export function tenantMiddleware(prisma: PrismaClient) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    const organizationId = req.auth.org;

    // On expose withTenant pré-lié à l'organisation du token.
    // Aucune transaction n'est ouverte ici : c'est au service de décider
    // quand ouvrir une transaction (via l'appel de la fonction).
    req.withTenant = <T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> =>
      withTenant(prisma, organizationId, fn);

    next();
  };
}
