import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

// Mapping centralisé des permissions par rôle
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'],
  EDITOR: [
    'folder:read',
    'folder:create',
    'folder:update',
    'document:read',
    'document:write',
    'tag:read',
    'tag:write', // AJOUT
  ],
  VIEWER: ['folder:read', 'document:read', 'tag:read'], // AJOUT
};

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.auth.role] ?? [];
    const hasPermission = userPermissions.includes('*') || userPermissions.includes(permission);

    if (!hasPermission) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }

    next();
  };
}
