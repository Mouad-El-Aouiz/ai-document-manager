import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.js';
import { AppError } from '../errors/AppError.js';
import { asyncLocalStorage } from '../infra/logger.js';
import type { Env } from '../config/env.js';

export function authenticate(env: Env) {
  const tokenService = new TokenService(env);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Missing or invalid authorization header'));
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Missing token'));
      return;
    }

    try {
      const payload = await tokenService.verifyAccessToken(token);
      req.auth = payload;

      // Enrichir le contexte asynchrone pour les logs
      const store = asyncLocalStorage.getStore();
      if (store) {
        asyncLocalStorage.enterWith({
          ...store,
          userId: payload.sub,
          organizationId: payload.org,
        });
      }
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token'));
    }
  };
}