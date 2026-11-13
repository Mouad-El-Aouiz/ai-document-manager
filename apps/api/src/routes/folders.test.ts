import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { PrismaClient } from '@prisma/client';

interface FolderDto {
  id: string;
  name: string;
  organizationId: string;
}

interface FoldersResponseBody {
  folders: FolderDto[];
}

interface LoginResponseBody {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

describe('Folders E2E (JWT -> Org -> RLS)', () => {
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
  const prisma = createPrismaClient();
  const redis = createRedisClient(env.REDIS_URL);

  const adminUrl = process.env.DATABASE_URL_MIGRATE;
  if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE is required');
  const adminPrisma = new PrismaClient({ datasourceUrl: adminUrl });

  const app = createApp({ env, logger, prisma, redis });

  let aliceToken = '';
  let charlieToken = '';

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUnique({ where: { email: 'alice@acme.com' } });
    const charlie = await adminPrisma.user.findUnique({ where: { email: 'charlie@beta.com' } });
    if (!alice || !charlie) throw new Error('Seed missing. Run `pnpm --filter @aidm/api db:seed`');

    const aliceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@acme.com', password: 'alice' });
    expect(aliceLogin.status).toBe(200);
    aliceToken = (aliceLogin.body as LoginResponseBody).accessToken;

    const charlieLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'charlie@beta.com', password: 'charlie' });
    expect(charlieLogin.status).toBe(200);
    charlieToken = (charlieLogin.body as LoginResponseBody).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should reject unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/folders');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('should return only Acme folders for alice (Acme)', async () => {
    const res = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    const body = res.body as FoldersResponseBody;
    const names = body.folders.map((f) => f.name);
    expect(names).toContain('Contrats');
    expect(names).not.toContain('Dossier Beta');
  });

  it('should return only Beta folders for charlie (Beta)', async () => {
    const res = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${charlieToken}`);

    expect(res.status).toBe(200);
    const body = res.body as FoldersResponseBody;
    const names = body.folders.map((f) => f.name);
    expect(names).toContain('Dossier Beta');
    expect(names).not.toContain('Contrats');
  });

  it('should return only folders from the caller organization (no cross-tenant leak)', async () => {
    const acmeRes = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`);
    const betaRes = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${charlieToken}`);

    const acmeFolders = (acmeRes.body as FoldersResponseBody).folders;
    const betaFolders = (betaRes.body as FoldersResponseBody).folders;

    // Vérification stricte : chaque folder renvoyé appartient bien à l'org du token
    const aliceRecord = await adminPrisma.user.findUniqueOrThrow({
      where: { email: 'alice@acme.com' },
    });
    const charlieRecord = await adminPrisma.user.findUniqueOrThrow({
      where: { email: 'charlie@beta.com' },
    });

    for (const f of acmeFolders) {
      expect(f.organizationId).toBe(aliceRecord.organizationId);
    }
    for (const f of betaFolders) {
      expect(f.organizationId).toBe(charlieRecord.organizationId);
    }

    // Aucune intersection
    const acmeIds = new Set(acmeFolders.map((f) => f.id));
    for (const f of betaFolders) {
      expect(acmeIds.has(f.id)).toBe(false);
    }
  });
});
