import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';

describe('Document Metadata & Tags', () => {
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
  let docId = '';

  beforeAll(async () => {
    const aliceLogin = await request(app).post('/api/v1/auth/login').send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (aliceLogin.body as { accessToken: string }).accessToken;

    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    const doc = await adminPrisma.document.create({
      data: { name: 'meta-test.txt', organizationId: alice.organizationId, uploadedById: alice.id },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await adminPrisma.document.deleteMany({ where: { id: docId } });
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should update document metadata with valid JSON', async () => {
    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/metadata`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ metadata: { author: 'Alice', year: 2026, draft: true } });

    expect(res.status).toBe(200);
    expect((res.body as { document: { metadata: unknown } }).document.metadata).toEqual({
      author: 'Alice', year: 2026, draft: true,
    });
  });

  it('should reject metadata with too many keys', async () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 25; i++) metadata[`key${String(i)}`] = 'value';

    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/metadata`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ metadata });

    expect(res.status).toBe(400);
  });

  it('should replace tags on a document', async () => {
    const tag1 = await request(app).post('/api/v1/tags').set('Authorization', `Bearer ${aliceToken}`).send({ name: 'urgent' });
    const tag2 = await request(app).post('/api/v1/tags').set('Authorization', `Bearer ${aliceToken}`).send({ name: 'finance' });
    const tag1Id = (tag1.body as { tag: { id: string } }).tag.id;
    const tag2Id = (tag2.body as { tag: { id: string } }).tag.id;

    const res = await request(app)
      .put(`/api/v1/documents/${docId}/tags`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ tagIds: [tag1Id, tag2Id] });
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .put(`/api/v1/documents/${docId}/tags`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ tagIds: [tag1Id] });
    expect(res2.status).toBe(200);
  });
});