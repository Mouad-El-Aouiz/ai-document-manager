import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncLocalStorage } from '../infra/logger.js';

const uuidSchema = z.string().uuid();

export function requestContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incomingId = req.headers['x-request-id'];
    const parsed = uuidSchema.safeParse(incomingId);

    // On garde l'ID entrant seulement s'il est valide, sinon on en crée un
    const requestId = parsed.success ? parsed.data : randomUUID();

    // On renvoie toujours l'ID utilisé au client
    res.setHeader('X-Request-Id', requestId);

    // On lance le contexte asynchrone
    asyncLocalStorage.run({ requestId }, () => {
      next();
    });
  };
}
