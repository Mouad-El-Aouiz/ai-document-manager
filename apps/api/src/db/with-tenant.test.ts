import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withTenant } from './with-tenant.js';

// 1. Validation explicite pour satisfaire TypeScript (narrowing)
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATE) {
  throw new Error('DATABASE_URL and DATABASE_URL_MIGRATE are required for integration tests');
}

// 2. Maintenant, TypeScript sait que ce sont des strings
const appPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const adminPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_MIGRATE });


describe('withTenant (RLS Isolation)', () => {
  let acmeId = '';
  let betaId = '';
  let betaUserId = '';

  beforeAll(async () => {
    const acme = await adminPrisma.organization.findUnique({ where: { slug: 'acme-corp' } });
    const beta = await adminPrisma.organization.findUnique({ where: { slug: 'beta-corp' } });
    const betaUser = await adminPrisma.user.findUnique({ where: { email: 'charlie@beta.com' } });
    if (!acme || !beta || !betaUser) throw new Error('Seed missing');

    acmeId = acme.id;
    betaId = beta.id;
    betaUserId = betaUser.id;
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
  });

  it('should fail-closed (0 rows) if withTenant is not used', async () => {
    // Requête directe sans contexte -> la RLS doit bloquer
    const folders = await appPrisma.folder.findMany();
    expect(folders).toHaveLength(0);
  });

  it('should isolate data between tenants', async () => {
    // Acme ne voit que Acme
    await withTenant(appPrisma, acmeId, async (tx) => {
      const folders = await tx.folder.findMany();
      expect(folders.every((f) => f.organizationId === acmeId)).toBe(true);
      expect(folders.length).toBeGreaterThan(0);
    });

    // Beta ne voit que Beta
    await withTenant(appPrisma, betaId, async (tx) => {
      const folders = await tx.folder.findMany();
      expect(folders.every((f) => f.organizationId === betaId)).toBe(true);
      expect(folders.length).toBeGreaterThan(0);
    });
  });

  it('should reject INSERT with wrong organizationId (WITH CHECK)', async () => {
    await expect(
      withTenant(appPrisma, acmeId, async (tx) => {
        // Tentative d'insérer un dossier pour Beta depuis le contexte d'Acme
        await tx.folder.create({
          data: {
            name: 'Hacked Folder',
            organizationId: betaId,
            createdById: betaUserId,
          },
        });
      }),
    ).rejects.toThrow(/violates row-level security policy/i);
  });

  it('should not leak context between concurrent requests', async () => {
    // On lance 2 requêtes en parallèle avec des contextes différents
    const results = await Promise.all([
      withTenant(appPrisma, acmeId, async (tx) => {
        // Petite pause pour simuler une requête lente
        await new Promise((r) => setTimeout(r, 50));
        return tx.folder.findMany();
      }),
      withTenant(appPrisma, betaId, async (tx) => {
        await new Promise((r) => setTimeout(r, 20));
        return tx.folder.findMany();
      }),
    ]);

    const acmeFolders = results[0];
    const betaFolders = results[1];

    expect(acmeFolders?.every((f) => f.organizationId === acmeId)).toBe(true);
    expect(betaFolders?.every((f) => f.organizationId === betaId)).toBe(true);
  });
});
