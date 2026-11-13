import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RefreshTokenService } from './refresh-token.service.js';
import { parseEnv } from '../config/env.js';

const adminUrl = process.env.DATABASE_URL_MIGRATE;
if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE is required for these tests');
const adminPrisma = new PrismaClient({ datasourceUrl: adminUrl });

describe('RefreshTokenService (Rotation)', () => {
  let service: RefreshTokenService;
  let userId = '';

  beforeAll(async () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      CORS_ORIGINS: 'http://localhost:3000',
    });
    service = new RefreshTokenService(adminPrisma, env);

    const alice = await adminPrisma.user.findUnique({ where: { email: 'alice@acme.com' } });
    if (!alice) throw new Error('Seed missing. Run `pnpm --filter @aidm/api db:seed`');
    userId = alice.id;
  });

  beforeEach(async () => {
    // Isolation stricte entre tests : on repart d'un état vierge pour alice
    await adminPrisma.refreshToken.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await adminPrisma.$disconnect();
  });

  it('should issue a token and rotate it successfully', async () => {
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rt1 = await service.issueInitialToken(user);

    const result = await service.rotateToken(rt1);
    expect(result.refreshToken).not.toBe(rt1);

    const oldToken = await adminPrisma.refreshToken.findFirst({
      where: { consumedAt: { not: null }, userId: user.id },
    });
    expect(oldToken).toBeDefined();
  });

  it('should revoke family on reuse (replay attack)', async () => {
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rt1 = await service.issueInitialToken(user);

    // Rotation normale (rt1 consommé, rt2 actif dans la même famille)
    await service.rotateToken(rt1);

    // Replay de rt1 → doit lever une erreur ET révoquer la famille
    await expect(service.rotateToken(rt1)).rejects.toThrow(
      'Token reuse detected. Session revoked.',
    );

    // Plus aucun token actif pour cet utilisateur
    const tokens = await adminPrisma.refreshToken.findMany({ where: { userId: user.id } });
    const activeTokens = tokens.filter((t) => t.revokedAt === null);
    expect(activeTokens).toHaveLength(0);
  });
});
