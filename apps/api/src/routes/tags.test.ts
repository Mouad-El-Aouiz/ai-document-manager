import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';

interface TagBody {
  tag: { id: string; name: string; color: string | null };
}

describe('Tags CRUD (E2E)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    REDIS_URL: process.env.REDIS_URL,
    JWT_ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    JWT_REFRESH_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    CORS_ORIGINS: 'http://localhost:3000',
    ALLOWED_MIME_TYPES: 'application/pdf,text/plain',
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
    S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
    S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
  });

  const logger = createLogger(env);
  logger.level = 'silent';
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);
  const adminUrl = process.env.DATABASE_URL_MIGRATE;
  if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE required');
  const adminPrisma = new PrismaClient({ datasourceUrl: adminUrl });

  const app = createApp({ env, logger, prisma, redis });

  let aliceToken = '';
  let charlieToken = '';
  let aliceOrgId = '';

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    aliceOrgId = alice.organizationId;

    const aliceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (aliceLogin.body as { accessToken: string }).accessToken;

    const charlieLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@beta.com', password: 'charlie' });
    charlieToken = (charlieLogin.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    // Nettoyage strict entre chaque test (nécessaire car les tags sont uniques par org)
    await adminPrisma.documentTag.deleteMany({});
    await adminPrisma.tag.deleteMany({ where: { organizationId: aliceOrgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should normalize and create a tag', async () => {
    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: '  Important  ', color: '#FF0000' });

    expect(res.status).toBe(201);
    expect((res.body as TagBody).tag.name).toBe('important');
    expect((res.body as TagBody).tag.color).toBe('#FF0000');
  });

  it('should reject a duplicate tag in the same org', async () => {
    await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'important' });

    const res = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'important' });

    expect(res.status).toBe(409);
  });

  it('should isolate tags between organizations', async () => {
    await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'acme-only' });

    const res = await request(app)
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${charlieToken}`);

    expect(res.status).toBe(200);
    expect((res.body as { tags: unknown[] }).tags).toHaveLength(0);
  });
});
