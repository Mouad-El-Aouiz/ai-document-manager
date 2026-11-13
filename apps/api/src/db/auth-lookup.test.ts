import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { authLookupUser } from './auth-lookup.js';

const dbUrl = process.env.DATABASE_URL;
const migrateUrl = process.env.DATABASE_URL_MIGRATE;

if (!dbUrl || !migrateUrl) {
  throw new Error('DATABASE_URL and DATABASE_URL_MIGRATE must be set for tests');
}

const appPrisma = new PrismaClient({ datasourceUrl: dbUrl });
const adminPrisma = new PrismaClient({ datasourceUrl: migrateUrl });

describe('authLookupUser (SECURITY DEFINER)', () => {
  beforeAll(async () => {
    const alice = await adminPrisma.user.findUnique({ where: { email: 'alice@acme.com' } });
    if (!alice) throw new Error('Seed manquant. Lancez pnpm --filter @aidm/api db:seed');
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
  });

  it('should find an existing user by email', async () => {
    const user = await authLookupUser(appPrisma, 'alice@acme.com');
    
    expect(user).not.toBeNull();
    expect(user?.role).toBe('ADMIN');
    expect(user?.passwordHash).toBeDefined();
    expect(user?.organizationId).toBeDefined();
  });

  it('should be case-insensitive', async () => {
    const user = await authLookupUser(appPrisma, 'ALICE@ACME.COM');
    expect(user).not.toBeNull();
    expect(user?.role).toBe('ADMIN');
  });

  it('should return null for unknown email', async () => {
    const user = await authLookupUser(appPrisma, 'unknown@example.com');
    expect(user).toBeNull();
  });

  it('should NOT allow aidm_app to select User directly without RLS context', async () => {
    const users = await appPrisma.user.findMany();
    expect(users).toHaveLength(0);
  });
});