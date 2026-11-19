import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { createHash } from 'node:crypto';

describe('Cross-tenant isolation (all routes)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    REDIS_URL: process.env.REDIS_URL,
    JWT_ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    JWT_REFRESH_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    CORS_ORIGINS: 'http://localhost:3000',
    ALLOWED_MIME_TYPES: 'text/plain',
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

  // Ressources créées par Alice (Acme)
  let aliceFolderId = '';
  let aliceDocId = '';
  let aliceTagId = '';

  beforeAll(async () => {
    const aliceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (aliceLogin.body as { accessToken: string }).accessToken;

    const charlieLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@beta.com', password: 'charlie' });
    charlieToken = (charlieLogin.body as { accessToken: string }).accessToken;

    // 1. Alice crée un dossier
    const folderRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: `Isolation Folder ${Date.now()}` });
    expect(folderRes.status).toBe(201);
    aliceFolderId = (folderRes.body as { folder: { id: string } }).folder.id;

    // 2. Alice crée un document
    const content = 'isolation test';
    const sha256 = createHash('sha256').update(content).digest('base64');
    const init = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'iso.txt',
        mimeType: 'text/plain',
        sizeBytes: content.length,
        sha256,
        folderId: aliceFolderId,
      });
    aliceDocId = (init.body as { documentId: string }).documentId;
    const versionId = (init.body as { versionId: string }).versionId;
    await request(app)
      .post(`/api/v1/documents/uploads/${versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);

    // 3. Alice crée un tag
    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: `iso-tag-${Date.now()}` });
    expect(tagRes.status).toBe(201);
    aliceTagId = (tagRes.body as { tag: { id: string } }).tag.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('GET /folders/:id from another org → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/folders/${aliceFolderId}`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /folders/:id from another org → 404', async () => {
    const res = await request(app)
      .patch(`/api/v1/folders/${aliceFolderId}`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ name: 'hacked' });
    expect(res.status).toBe(404);
  });

  it('DELETE /folders/:id from another org → 404', async () => {
    const res = await request(app)
      .delete(`/api/v1/folders/${aliceFolderId}`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /folders/:id/breadcrumb from another org → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/folders/${aliceFolderId}/breadcrumb`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /documents/:id from another org → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${aliceDocId}`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /documents/:id/download from another org → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${aliceDocId}/download`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /documents/:id/versions from another org → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${aliceDocId}/versions`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('POST /documents/:id/versions from another org → 404', async () => {
    const res = await request(app)
      .post(`/api/v1/documents/${aliceDocId}/versions`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({
        filename: 'hack.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sha256: 'a'.repeat(44),
      });
    expect(res.status).toBe(404);
  });

  it('DELETE /documents/:id from another org → 404', async () => {
    const res = await request(app)
      .delete(`/api/v1/documents/${aliceDocId}`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /tags/:id from another org → 404', async () => {
    const res = await request(app)
      .patch(`/api/v1/tags/${aliceTagId}`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ name: 'hacked' });
    expect(res.status).toBe(404);
  });
});
