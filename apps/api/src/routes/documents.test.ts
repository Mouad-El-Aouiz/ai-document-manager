import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { FakeStorageProvider } from '../infra/storage/fake.provider.js';

interface InitResponse {
  documentId: string;
  versionId: string;
  uploadUrl: string;
}

interface ListResponse {
  documents: { id: string; name: string }[];
  nextCursor: string | null;
}

describe('Documents CRUD (E2E)', () => {
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

  // On force un FakeStorageProvider partagé pour pouvoir y injecter des objets
  const fakeStorage = new FakeStorageProvider();
  const app = createApp({ env, logger, prisma, redis, storage: fakeStorage });

  let aliceToken = '';
  let charlieToken = '';
  let viewerToken = '';
  let createdDocId = '';

  const content = 'Hello, world!';
  const sha256 = createHash('sha256').update(content).digest('base64');

  async function uploadOneDocument(name: string): Promise<string> {
    const initRes = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ filename: name, mimeType: 'text/plain', sizeBytes: content.length, sha256 });
    expect(initRes.status).toBe(201);
    const init = initRes.body as InitResponse;

    // On simule l'upload en injectant l'objet dans le FakeStorageProvider
    if (init.uploadUrl.includes('fake-s3')) {
      const key = init.uploadUrl.replace('http://fake-s3/', '');
      fakeStorage._set(key, content, 'text/plain');
    } else {
      const putRes = await fetch(init.uploadUrl, {
        method: 'PUT',
        body: content,
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(putRes.status).toBe(200);
    }

    const completeRes = await request(app)
      .post(`/api/v1/documents/uploads/${init.versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(completeRes.status).toBe(200);
    return init.documentId;
  }

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });

    await adminPrisma.user.upsert({
      where: { email: 'viewer@acme.com' },
      update: {},
      create: {
        email: 'viewer@acme.com',
        passwordHash: await (await import('argon2')).hash('viewer'),
        role: 'VIEWER',
        organizationId: alice.organizationId,
      },
    });

    const aliceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (aliceLogin.body as { accessToken: string }).accessToken;

    const charlieLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@beta.com', password: 'charlie' });
    charlieToken = (charlieLogin.body as { accessToken: string }).accessToken;

    const viewerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@acme.com', password: 'viewer' });
    viewerToken = (viewerLogin.body as { accessToken: string }).accessToken;

    createdDocId = await uploadOneDocument('listing-test.txt');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should list documents with cursor pagination', async () => {
    const res = await request(app)
      .get('/api/v1/documents?limit=1')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    const body = res.body as ListResponse;
    expect(body.documents.length).toBeLessThanOrEqual(1);
    expect(body.nextCursor === null || typeof body.nextCursor === 'string').toBe(true);
  });

  it('should return only documents from the caller organization', async () => {
    const aliceRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${aliceToken}`);
    const charlieRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${charlieToken}`);

    const aliceDocs = (aliceRes.body as ListResponse).documents;
    const charlieDocs = (charlieRes.body as ListResponse).documents;

    const aliceIds = new Set(aliceDocs.map((d) => d.id));
    for (const d of charlieDocs) {
      expect(aliceIds.has(d.id)).toBe(false);
    }
  });

  it('should return 404 for a document of another organization', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${createdDocId}`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });

  it('should download a document via presigned URL', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${createdDocId}/download`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    const body = res.body as { url: string };
    expect(body.url).toMatch(/^http/);

    if (body.url.includes('fake-s3')) {
      return;
    }

    const fileRes = await fetch(body.url);
    expect(fileRes.status).toBe(200);
    const text = await fileRes.text();
    expect(text).toBe(content);
  });

  it('should rename a document', async () => {
    const res = await request(app)
      .patch(`/api/v1/documents/${createdDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'renamed.txt' });

    expect(res.status).toBe(200);
    expect((res.body as { document: { name: string } }).document.name).toBe('renamed.txt');
  });

  it('should forbid a VIEWER from deleting (403)', async () => {
    const res = await request(app)
      .delete(`/api/v1/documents/${createdDocId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('should soft-delete a document and hide it from listings', async () => {
    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${createdDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${aliceToken}`);
    const ids = (listRes.body as ListResponse).documents.map((d) => d.id);
    expect(ids).not.toContain(createdDocId);

    const getRes = await request(app)
      .get(`/api/v1/documents/${createdDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(getRes.status).toBe(404);
  });
});
