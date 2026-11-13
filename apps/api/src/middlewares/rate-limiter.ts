import { RateLimiterRedis } from 'rate-limiter-flexible';
import type { Redis } from 'ioredis';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError.js';
import type { Env } from '../config/env.js';

export function createLoginRateLimiter(redis: Redis, env: Env) {
  // En test, on ne veut pas que le rate limiter interfère entre les tests
  if (env.NODE_ENV === 'test') {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:login',
    points: 5,
    duration: 15 * 60,
    blockDuration: 15 * 60,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Cast explicite pour éviter le 'any' d'Express
    const body = req.body as { email?: string } | undefined;
    const email = body?.email?.toLowerCase() ?? 'unknown';
    const ip = req.ip ?? 'unknown';
    const key = `${ip}:${email}`;

    try {
      await limiter.consume(key);
      next();
    } catch {
      next(new AppError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.'));
    }
  };
}
