import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRouter } from './health.js';
import type { PrismaClient } from '../infra/prisma.js';
import type { Redis } from '../infra/redis.js';

describe('Health Routes', () => {
  const createTestApp = (prismaMock: unknown, redisMock: unknown) => {
    const app = express();
    app.use(healthRouter(prismaMock as PrismaClient, redisMock as Redis));
    return app;
  };

  it('GET /health/live should return 200', async () => {
    const app = createTestApp({}, {});
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health should return 200 when both db and redis are up', async () => {
    const prismaMock = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redisMock = { ping: vi.fn().mockResolvedValue('PONG') };

    const app = createTestApp(prismaMock, redisMock);
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { db: 'up', redis: 'up' } });
  });

  it('GET /health should return 503 if redis is down', async () => {
    const prismaMock = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redisMock = { ping: vi.fn().mockRejectedValue(new Error('Connection refused')) };

    const app = createTestApp(prismaMock, redisMock);
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', checks: { db: 'up', redis: 'down' } });
  });
});
