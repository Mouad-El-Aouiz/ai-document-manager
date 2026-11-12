import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { z } from 'zod';
import { AppError } from '../errors/AppError.js';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as unknown;
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query) as Record<string, unknown>;
        Object.assign(req.query, parsedQuery);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Invalid request data',
          error.flatten().fieldErrors,
        );
      }
      next(error);
    }
  };
}
