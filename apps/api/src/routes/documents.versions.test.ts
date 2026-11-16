import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';

interface InitResponse {
  documentId: string;
  versionId: string;
  uploadUrl: string;
}
interface InitNewVersionResponse {
  versionId: string;
  uploadUrl: string;
}
interface VersionListResponse {
  versions: { id: string; versionNumber: number; status: string }[];
}

describe('Document Versions (E2E)', () => {
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
  let documentId = '';

  const contentV1 = 'Version 1 content';
  const contentV2 = 'Version 2 content';

  function hash(s: string): string {
    return createHash('sha256').update(s).digest('base64');
  }

  async function uploadV1(): Promise<string> {
    const init = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'v1.txt',
        mimeType: 'text/plain',
        sizeBytes: contentV1.length,
        sha256: hash(contentV1),
      });
    const body = init.body as InitResponse;

    if (!body.uploadUrl.includes('fake-s3')) {
      await fetch(body.uploadUrl, {
        method: 'PUT',
        body: contentV1,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    await request(app)
      .post(`/api/v1/documents/uploads/${body.versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);
    return body.documentId;
  }

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (login.body as { accessToken: string }).accessToken;
    documentId = await uploadV1();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should create a second version and set it as current', async () => {
    const init = await request(app)
      .post(`/api/v1/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'v2.txt',
        mimeType: 'text/plain',
        sizeBytes: contentV2.length,
        sha256: hash(contentV2),
      });
    expect(init.status).toBe(201);
    const body = init.body as InitNewVersionResponse;

    if (!body.uploadUrl.includes('fake-s3')) {
      await fetch(body.uploadUrl, {
        method: 'PUT',
        body: contentV2,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const complete = await request(app)
      .post(`/api/v1/documents/${documentId}/versions/${body.versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(complete.status).toBe(200);

    const versions = await request(app)
      .get(`/api/v1/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const list = (versions.body as VersionListResponse).versions;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]?.status).toBe('UPLOADED');

    const doc = await adminPrisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.currentVersionId).toBe(body.versionId);
  });

  it('should download an old version', async () => {
    const versions = await request(app)
      .get(`/api/v1/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const list = (versions.body as VersionListResponse).versions;
    const oldest = list[list.length - 1];
    if (!oldest) throw new Error('No versions');

    const res = await request(app)
      .get(`/api/v1/documents/${documentId}/versions/${oldest.id}/download`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect((res.body as { url: string }).url).toMatch(/^http/);
  });

  it('should restore an old version as a new version', async () => {
    const versions = await request(app)
      .get(`/api/v1/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const list = (versions.body as VersionListResponse).versions;
    const oldest = list[list.length - 1];
    if (!oldest) throw new Error('No versions');

    const res = await request(app)
      .post(`/api/v1/documents/${documentId}/versions/${oldest.id}/restore`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(201);

    const restored = (res.body as { version: { id: string; versionNumber: number } }).version;
    expect(restored.versionNumber).toBeGreaterThan(oldest.versionNumber);

    const doc = await adminPrisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(doc.currentVersionId).toBe(restored.id);
  });

  it('should 404 when downloading a version from another organization', async () => {
    const charlieLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@beta.com', password: 'charlie' });
    const charlieToken = (charlieLogin.body as { accessToken: string }).accessToken;

    const versions = await request(app)
      .get(`/api/v1/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    const list = (versions.body as VersionListResponse).versions;
    const someVersion = list[0];
    if (!someVersion) throw new Error('No versions');

    const res = await request(app)
      .get(`/api/v1/documents/${documentId}/versions/${someVersion.id}/download`)
      .set('Authorization', `Bearer ${charlieToken}`);
    expect(res.status).toBe(404);
  });
});
