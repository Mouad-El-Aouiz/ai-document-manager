import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';
import { asyncLocalStorage } from '../infra/logger.js';
import type { Logger } from 'pino';

export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const requestId = asyncLocalStorage.getStore()?.requestId ?? 'unknown';
    const isAppError = err instanceof AppError;

    if (!isAppError || err.statusCode >= 500) {
      // On s'assure que err est une instance d'Error pour Pino
      const logErr = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: logErr, requestId }, 'Unhandled or Server Error');
    } else {
      logger.warn({ code: err.code, message: err.message, requestId }, 'Application Error');
    }

    if (isAppError) {
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      });
    } else {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          requestId,
        },
      });
    }
  };
}
