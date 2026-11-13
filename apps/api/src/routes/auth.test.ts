import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { PrismaClient } from '@prisma/client';

describe('Auth Routes (E2E)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    REDIS_URL: process.env.REDIS_URL,
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
  });

  const logger = createLogger(env);
  logger.level = 'silent';

  // Client RLS (utilisé par l'API)
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);

  // Client admin (bypass RLS, utilisé uniquement pour vérifier le seed et nettoyer)
  const adminUrl = process.env.DATABASE_URL_MIGRATE;
  if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE is required');
  const adminPrisma = new PrismaClient({ datasourceUrl: adminUrl });

  const app = createApp({ env, logger, prisma, redis });

  let aliceId = '';
  let bobId = '';

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUnique({ where: { email: 'alice@acme.com' } });
    const bob = await adminPrisma.user.findUnique({ where: { email: 'bob@acme.com' } });
    if (!alice || !bob) throw new Error('Seed missing. Run `pnpm --filter @aidm/api db:seed`');
    aliceId = alice.id;
    bobId = bob.id;
  });

  beforeEach(async () => {
    // Isolation : on supprime les refresh tokens entre les tests
    await adminPrisma.refreshToken.deleteMany({
      where: { userId: { in: [aliceId, bobId] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should login successfully and return an access token + cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('alice@acme.com');

    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const firstCookie = cookies?.[0];
    expect(firstCookie).toBeDefined();
    expect(firstCookie).toContain('refresh_token=');
    expect(firstCookie).toContain('HttpOnly');
  });

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('should rotate refresh token and return new access token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@acme.com', password: 'bob' });

    const loginCookies = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
    const refreshCookie = loginCookies?.[0];
    if (!refreshCookie) throw new Error('No refresh cookie returned by login');

    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();

    const newCookies = refreshRes.headers['set-cookie'] as unknown as string[] | undefined;
    const newCookie = newCookies?.[0];
    if (!newCookie) throw new Error('No refresh cookie returned by refresh');
    expect(newCookie).not.toBe(refreshCookie);
  });

  it('should revoke session on logout', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@acme.com', password: 'bob' });

    expect(loginRes.status).toBe(200);

    const loginCookies = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
    const refreshCookie = loginCookies?.[0];
    if (!refreshCookie) throw new Error('No refresh cookie returned by login');

    const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', refreshCookie);

    expect(logoutRes.status).toBe(204);

    const logoutCookies = logoutRes.headers['set-cookie'] as unknown as string[] | undefined;
    const logoutCookie = logoutCookies?.[0];
    expect(logoutCookie).toBeDefined();
    expect(logoutCookie).toContain('refresh_token=;');
  });
});
