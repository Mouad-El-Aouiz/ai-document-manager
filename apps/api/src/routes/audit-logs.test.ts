import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';

interface AuditListResponse {
  logs: {
    id: string;
    action: string;
    entityType: string;
    ip: string | null;
    requestId: string | null;
  }[];
  nextCursor: string | null;
}

describe('Audit Logs (E2E)', () => {
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
  let bobToken = '';
  let orgId = '';
  let testFolderId = '';

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    orgId = alice.organizationId;

    const aliceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    aliceToken = (aliceLogin.body as { accessToken: string }).accessToken;

    const bobLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bob@acme.com', password: 'bob' });
    bobToken = (bobLogin.body as { accessToken: string }).accessToken;

    // Créer un dossier pour générer des logs FOLDER_CREATE
    const folderRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Audit Test Folder' });
    testFolderId = (folderRes.body as { folder: { id: string } }).folder.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should forbid EDITOR from listing audit logs (403)', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${bobToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should list audit logs for ADMIN with requestId and ip', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs?action=FOLDER_CREATE')
      .set('Authorization', `Bearer ${aliceToken}`)
      .set('X-Request-Id', '123e4567-e89b-12d3-a456-426614174000');

    expect(res.status).toBe(200);
    const body = res.body as AuditListResponse;
    expect(body.logs.length).toBeGreaterThanOrEqual(1);

    const log = body.logs.find((l) => l.action === 'FOLDER_CREATE' && l.entityType === 'Folder');
    expect(log).toBeDefined();
    expect(log?.requestId).toBeDefined();
    expect(log?.ip).toBeDefined();
  });

  it('should filter audit logs by entityId', async () => {
    const res = await request(app)
      .get(`/api/v1/audit-logs?entityId=${testFolderId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    const body = res.body as AuditListResponse;
    expect(body.logs.every((l) => l.entityType === 'Folder')).toBe(true);
  });

  it('should prevent aidm_app from updating/deleting AuditLog (SQL immutability)', async () => {
    const logs = await adminPrisma.auditLog.findMany({ where: { organizationId: orgId }, take: 1 });
    const log = logs[0];
    if (!log) throw new Error('No logs found');

    // On tente de supprimer via l'API (aidm_app)
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /permission denied/i,
    );

    // On tente de modifier
    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'HACKED' } }),
    ).rejects.toThrow(/permission denied/i);
  });
});
