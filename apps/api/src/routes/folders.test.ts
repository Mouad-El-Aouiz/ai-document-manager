import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { createPrismaClient } from '../infra/prisma.js';
import { createRedisClient } from '../infra/redis.js';
import { PrismaClient } from '@prisma/client';

interface FolderResponse {
  folder: { id: string; name: string; parentId: string | null; organizationId: string };
}

interface FoldersResponse {
  folders: FolderResponse['folder'][];
}

describe('Folders CRUD (E2E)', () => {
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
  let aliceOrgId = '';
  let charlieOrgId = '';

  beforeAll(async () => {
    const alice = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    const charlie = await adminPrisma.user.findUniqueOrThrow({
      where: { email: 'charlie@beta.com' },
    });
    aliceOrgId = alice.organizationId;
    charlieOrgId = charlie.organizationId;

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
    // Nettoyer les dossiers créés dans les tests (hors seed)
    await adminPrisma.folder.deleteMany({
      where: { id: { notIn: ['seed-folder-contracts', 'seed-folder-beta'] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    await redis.quit();
  });

  it('should create a folder and return 201', async () => {
    const res = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Rapports' });

    expect(res.status).toBe(201);
    const body = res.body as FolderResponse;
    expect(body.folder.name).toBe('Rapports');
    expect(body.folder.organizationId).toBe(aliceOrgId);
  });

  it('should reject duplicate folder name in same parent with 409', async () => {
    await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Unique' });

    const res = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Unique' });

    expect(res.status).toBe(409);
  });

  it('should reject parentId from another organization with 404', async () => {
    // Charlie crée un dossier
    const charlieFolderRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ name: 'Beta Folder' });
    const charlieFolderId = (charlieFolderRes.body as FolderResponse).folder.id;

    // Alice essaie de l'utiliser comme parent
    const res = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Hacked', parentId: charlieFolderId });

    expect(res.status).toBe(404);
  });

  it('should list only folders from the caller organization', async () => {
    await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alice Folder' });
    await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ name: 'Charlie Folder' });

    const aliceRes = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`);
    const charlieRes = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${charlieToken}`);

    const aliceFolders = (aliceRes.body as FoldersResponse).folders;
    const charlieFolders = (charlieRes.body as FoldersResponse).folders;

    expect(aliceFolders.every((f) => f.organizationId === aliceOrgId)).toBe(true);
    expect(charlieFolders.every((f) => f.organizationId === charlieOrgId)).toBe(true);
  });

  it('should soft-delete a folder and hide it from listings', async () => {
    const createRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'To Delete' });
    const folderId = (createRes.body as FolderResponse).folder.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`);
    const folders = (listRes.body as FoldersResponse).folders;
    expect(folders.find((f) => f.id === folderId)).toBeUndefined();
  });

  it('should allow recreating a folder with the same name after soft delete', async () => {
    const createRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Recyclable' });
    const folderId = (createRes.body as FolderResponse).folder.id;

    await request(app)
      .delete(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const recreateRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Recyclable' });

    expect(recreateRes.status).toBe(201);
  });

  it('should forbid a VIEWER from creating a folder (403)', async () => {
    // Note : le seed n'a pas de VIEWER explicite, on le crée pour le test
    const viewerHash = await argon2.hash('viewer');
    await adminPrisma.user.upsert({
      where: { email: 'viewer@acme.com' },
      update: { passwordHash: viewerHash },
      create: {
        email: 'viewer@acme.com',
        passwordHash: viewerHash,
        role: 'VIEWER',
        organizationId: aliceOrgId,
      },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@acme.com', password: 'viewer' });
    const viewerToken = (loginRes.body as { accessToken: string }).accessToken;

    const res = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden' });

    expect(res.status).toBe(403);
  });

  // ... (imports et setup existants)

  it('should return breadcrumb for a nested folder', async () => {
    const rootRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Root' });
    const rootId = (rootRes.body as FolderResponse).folder.id;

    const childRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Child', parentId: rootId });
    const childId = (childRes.body as FolderResponse).folder.id;

    const res = await request(app)
      .get(`/api/v1/folders/${childId}/breadcrumb`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    const breadcrumb = (res.body as { breadcrumb: { id: string; name: string }[] }).breadcrumb;
    expect(breadcrumb).toHaveLength(2);
    expect(breadcrumb[0]?.name).toBe('Root');
    expect(breadcrumb[1]?.name).toBe('Child');
  });

  it('should prevent creating a cycle by moving a folder into its descendant', async () => {
    const aRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Folder A' });
    const aId = (aRes.body as FolderResponse).folder.id;

    const bRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Folder B', parentId: aId });
    const bId = (bRes.body as FolderResponse).folder.id;

    const res = await request(app)
      .patch(`/api/v1/folders/${aId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: bId });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Cannot move a folder into its own descendant');
  });

  it('should move a folder to root', async () => {
    const parentRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Parent' });
    const parentId = (parentRes.body as FolderResponse).folder.id;

    const childRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Child Move', parentId });
    const childId = (childRes.body as FolderResponse).folder.id;

    const moveRes = await request(app)
      .patch(`/api/v1/folders/${childId}/move`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ parentId: null });

    expect(moveRes.status).toBe(200);
    expect((moveRes.body as FolderResponse).folder.parentId).toBeNull();
  });

  it('should cascade soft delete to children and documents', async () => {
    const parentRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Parent Delete' });
    const parentId = (parentRes.body as FolderResponse).folder.id;

    const childRes = await request(app)
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Child Delete', parentId });
    const childId = (childRes.body as FolderResponse).folder.id;

    // Créer un document bidon dans l'enfant via adminPrisma (car la route upload n'existe pas encore)
    const aliceUser = await adminPrisma.user.findUniqueOrThrow({
      where: { email: 'alice@acme.com' },
    });
    await adminPrisma.document.create({
      data: {
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storagePath: 'path',
        folderId: childId,
        organizationId: aliceOrgId,
        uploadedById: aliceUser.id,
      },
    });

    const deleteRes = await request(app)
      .delete(`/api/v1/folders/${parentId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(deleteRes.status).toBe(204);

    // Vérifier en base que tout est soft-deleted
    const dbParent = await adminPrisma.folder.findUnique({ where: { id: parentId } });
    const dbChild = await adminPrisma.folder.findUnique({ where: { id: childId } });
    const dbDoc = await adminPrisma.document.findFirst({ where: { folderId: childId } });

    expect(dbParent?.deletedAt).not.toBeNull();
    expect(dbChild?.deletedAt).not.toBeNull();
    expect(dbDoc?.deletedAt).not.toBeNull();
  });
});
