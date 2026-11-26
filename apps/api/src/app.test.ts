import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createLogger } from './infra/logger.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestContext } from './middlewares/request-context.js';
import { validate } from './middlewares/validate.js';
import { z } from 'zod';

describe('App Error Handling & Validation', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
  });

  const logger = createLogger(env);
  logger.level = 'silent';

  const mockPrisma = {
    $queryRaw: () => Promise.resolve([{ ok: 1 }]),
    $executeRaw: () => Promise.resolve(1),
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
  } as unknown as PrismaClient;

  const mockRedis = {
    ping: () => Promise.resolve('PONG'),
  } as unknown as Redis;

  const app = createApp({ env, logger, prisma: mockPrisma, redis: mockRedis });

  it('should return 200 for the root route', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('API is running');
  });

  it('should return 400 with standard format on Zod validation error', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(requestContext());
    testApp.post(
      '/test-validation',
      validate({ body: z.object({ name: z.string().min(3) }) }),
      (req, res) => {
        const body = req.body as { name: string };
        res.json({ received: body });
      },
    );
    testApp.use(errorHandler(logger));

    const res = await request(testApp).post('/test-validation').send({ name: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: { name: expect.any(Array) as unknown },
      requestId: expect.any(String) as unknown,
    });
  });

  it('should return 404 with standard format for unknown routes', async () => {
    const res = await request(app).get('/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  it('should return 500 without stack trace on unexpected error', async () => {
    const crashApp = express();
    crashApp.use(requestContext());
    crashApp.get('/crash', () => {
      throw new Error('Secret database error');
    });
    crashApp.use(errorHandler(logger));

    const res = await request(crashApp).get('/crash');

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('An unexpected error occurred');
    expect(res.body.error.message).not.toContain('Secret database error');
    expect(res.body.error).not.toHaveProperty('stack');
  });
});