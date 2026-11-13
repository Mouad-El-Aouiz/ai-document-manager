import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';

// Mapping centralisé des permissions par rôle
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ['*'], // Wildcard : toutes les permissions
  EDITOR: ['folder:read', 'folder:write', 'document:read', 'document:write'],
  VIEWER: ['folder:read', 'document:read'],
};

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.auth.role] ?? [];
    const hasPermission =
      userPermissions.includes('*') || userPermissions.includes(permission);

    if (!hasPermission) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }

    next();
  };
}