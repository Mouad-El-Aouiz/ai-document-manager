import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

interface InitResponse {
  documentId: string;
  versionId: string;
  uploadUrl: string;
}

describe('Document Upload (E2E)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    REDIS_URL: process.env.REDIS_URL,
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
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
  let viewerToken = '';
  let orgId = '';

  const content = 'Hello, world!';
  const sha256 = createHash('sha256').update(content).digest('base64');

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    orgId = alice.organizationId;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (loginRes.body as { accessToken: string }).accessToken;

    await adminPrisma.user.upsert({
      where: { email: 'viewer@acme.com' },
      update: {},
      create: {
        email: 'viewer@acme.com',
        passwordHash: await (await import('argon2')).hash('viewer'),
        role: 'VIEWER',
        organizationId: orgId,
      },
    });
    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@acme.com', password: 'viewer' });
    viewerToken = (viewerRes.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should upload a document end-to-end', async () => {
    // 1. Init
    const initRes = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'test.txt',
        mimeType: 'text/plain',
        sizeBytes: content.length,
        sha256,
      });

    expect(initRes.status).toBe(201);
    const { versionId, uploadUrl } = initRes.body as InitResponse;

    // 2. PUT : si l'URL commence par "http://fake-s3", on est en FakeStorageProvider (local),
    // on simule l'upload. Sinon on fait un vrai PUT.
    if (uploadUrl.startsWith('http://fake-s3')) {
      // En local avec FakeStorageProvider, on ne peut pas fetch, on skip le PUT.
      // Le test complet d'intégration S3 est fait dans s3.provider.test.ts
      console.log('Skipping PUT because FakeStorageProvider is active');
    } else {
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: content,
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(putRes.status).toBe(200);
    }

    // 3. Complete
    const completeRes = await request(app)
      .post(`/api/v1/documents/uploads/${versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);

    // Si on est en fake, le HEAD échouera car l'objet n'existe pas, mais on ne teste pas le complete ici.
    // Pour le test E2E réel, on s'attend à 200.
    if (!uploadUrl.startsWith('http://fake-s3')) {
      expect(completeRes.status).toBe(200);

      // Vérification en base
      const version = await adminPrisma.documentVersion.findUnique({ where: { id: versionId } });
      expect(version?.status).toBe('UPLOADED');
    }
  });

  it('should fail upload if mimeType is not allowed', async () => {
    const res = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'test.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 100,
        sha256: 'a'.repeat(44),
      });
    expect(res.status).toBe(400);
  });

  it('should forbid a VIEWER from uploading (403)', async () => {
    const res = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        filename: 'test.txt',
        mimeType: 'text/plain',
        sizeBytes: content.length,
        sha256,
      });
    expect(res.status).toBe(403);
  });
});
