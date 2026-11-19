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
interface InitVersionResponse {
  versionId: string;
  uploadUrl: string;
}

describe('Full lifecycle (E2E)', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
    REDIS_URL: process.env.REDIS_URL,
    JWT_ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    JWT_REFRESH_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    CORS_ORIGINS: 'http://localhost:3000',
    ALLOWED_MIME_TYPES: 'text/plain,application/pdf',
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

  function hash(s: string): string {
    return createHash('sha256').update(s).digest('base64');
  }

  async function putIfReal(url: string, body: string, contentType: string): Promise<void> {
    if (url.includes('fake-s3')) return;
    await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
  }

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('runs a full document lifecycle', async () => {
    const ts = Date.now();
    // 1. Dossier
    const folderRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: `E2E-Folder-${ts}` });
    expect(folderRes.status).toBe(201);
    const folderId = (folderRes.body as { folder: { id: string } }).folder.id;

    // 2. Upload v1 (sans folderId pour ne pas dépendre du dossier)
    const contentV1 = 'E2E content v1';
    const init1 = await request(app)
      .post('/api/v1/documents/uploads')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'e2e.txt',
        mimeType: 'text/plain',
        sizeBytes: contentV1.length,
        sha256: hash(contentV1),
      });
    expect(init1.status).toBe(201);
    const i1 = init1.body as InitResponse;
    await putIfReal(i1.uploadUrl, contentV1, 'text/plain');
    const complete1 = await request(app)
      .post(`/api/v1/documents/uploads/${i1.versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(complete1.status).toBe(200);

    // 3. Tag unique
    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: `e2e-tag-${ts}` });
    expect(tagRes.status).toBe(201);
    const tagId = (tagRes.body as { tag: { id: string } }).tag.id;

    const assignRes = await request(app)
      .put(`/api/v1/documents/${i1.documentId}/tags`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ tagIds: [tagId] });
    expect(assignRes.status).toBe(200);

    // 4. Metadata
    const metaRes = await request(app)
      .patch(`/api/v1/documents/${i1.documentId}/metadata`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ metadata: { author: 'alice', year: 2026 } });
    expect(metaRes.status).toBe(200);

    // 5. Upload v2
    const contentV2 = 'E2E content v2';
    const init2 = await request(app)
      .post(`/api/v1/documents/${i1.documentId}/versions`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        filename: 'e2e-v2.txt',
        mimeType: 'text/plain',
        sizeBytes: contentV2.length,
        sha256: hash(contentV2),
      });
    expect(init2.status).toBe(201);
    const i2 = init2.body as InitVersionResponse;
    await putIfReal(i2.uploadUrl, contentV2, 'text/plain');
    const complete2 = await request(app)
      .post(`/api/v1/documents/${i1.documentId}/versions/${i2.versionId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(complete2.status).toBe(200);

    // 6. Restore v1
    const restoreRes = await request(app)
      .post(`/api/v1/documents/${i1.documentId}/versions/${i1.versionId}/restore`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(restoreRes.status).toBe(201);
    const restoredVersionId = (restoreRes.body as { version: { id: string } }).version.id;

    // 7. Download restored
    const dlRes = await request(app)
      .get(`/api/v1/documents/${i1.documentId}/versions/${restoredVersionId}/download`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(dlRes.status).toBe(200);

    // 8. Delete doc
    const delRes = await request(app)
      .delete(`/api/v1/documents/${i1.documentId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(delRes.status).toBe(204);

    // 9. Delete folder
    await request(app)
      .delete(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    // 10. Check audit
    const auditRes = await request(app)
      .get('/api/v1/audit-logs?limit=100')
      .set('Authorization', `Bearer ${aliceToken}`);
    const logs = (auditRes.body as { logs: { action: string }[] }).logs;
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('FOLDER_CREATE');
    expect(actions).toContain('DOCUMENT_UPLOAD');
    expect(actions).toContain('DOCUMENT_RESTORE');
    expect(actions).toContain('DOCUMENT_DELETE');
  });
});
