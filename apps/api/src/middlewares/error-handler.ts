import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { asyncLocalStorage } from '../infra/logger.js';
import type { Logger } from 'pino';

export function errorHandler(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const requestId = asyncLocalStorage.getStore()?.requestId ?? 'unknown';

    // 1. Validation Zod → 400 VALIDATION_ERROR
    if (err instanceof ZodError) {
      logger.warn({ err, requestId }, 'Validation error');
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: err.flatten().fieldErrors,
          requestId,
        },
      });
      return;
    }

    const isAppError = err instanceof AppError;

    // 2. Log adapté au type d'erreur
    if (!isAppError || err.statusCode >= 500) {
      logger.error({ err, requestId }, 'Unhandled or Server Error');
    } else {
      logger.warn({ code: err.code, message: err.message, requestId }, 'Application Error');
    }

    // 3. Réponse client
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