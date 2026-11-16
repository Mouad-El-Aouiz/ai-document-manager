import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncLocalStorage } from '../infra/logger.js';

const uuidSchema = z.string().uuid();

export function requestContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incomingId = req.headers['x-request-id'];
    const parsed = uuidSchema.safeParse(incomingId);
    const requestId = parsed.success ? parsed.data : randomUUID();

    res.setHeader('X-Request-Id', requestId);

    asyncLocalStorage.run({ requestId, ip: req.ip }, () => {
      next();
    });
  };
}
