import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

interface CountResult {
  ok: number;
}

interface TableNameRow {
  table_name: string;
}

interface ExtnameRow {
  extname: string;
}

const migrateUrl = process.env.DATABASE_URL_MIGRATE;

if (!migrateUrl) {
  console.warn(
    '[prisma.integration] DATABASE_URL_MIGRATE is not set. ' +
      'Integration tests will be skipped. ' +
      'Run `pnpm infra:up && pnpm --filter @aidm/api db:migrate` and ensure .env exists.',
  );
}

describe.skipIf(!migrateUrl)('Prisma integration', () => {
  // Narrowing: inside this block, migrateUrl is guaranteed to be a string.
  // The `if` below is unreachable at runtime (skipIf prevents execution),
  // but TypeScript needs it to narrow the type for the closure below.
  if (!migrateUrl) {
    throw new Error('unreachable');
  }

  const prisma = new PrismaClient({ datasourceUrl: migrateUrl });

  afterAll(() => prisma.$disconnect());

  it('connects to PostgreSQL via Prisma', async () => {
    const rows = await prisma.$queryRaw<CountResult[]>`SELECT 1 AS ok`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ok).toBe(1);
  });

  it('has all expected tables in the public schema', async () => {
    const expected = [
      'AuditLog',
      'Document',
      'DocumentChunk',
      'Folder',
      'Organization',
      'User',
    ].sort();

    const rows = await prisma.$queryRaw<TableNameRow[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Organization', 'User', 'Folder', 'Document', 'DocumentChunk', 'AuditLog')
      ORDER BY table_name
    `;

    const actual = rows.map((row) => row.table_name);
    expect(actual).toEqual(expected);
  });

  it('has the pgvector extension installed', async () => {
    const rows = await prisma.$queryRaw<ExtnameRow[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(rows).toHaveLength(1);
  });
});
