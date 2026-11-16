import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { cleanupPendingUploads } from '../cleanup-pending-uploads.js';

const adminUrl = process.env.DATABASE_URL_MIGRATE;
if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE required');
const prisma = new PrismaClient({ datasourceUrl: adminUrl });

describe('cleanupPendingUploads', () => {
  afterEach(async () => {
    await prisma.documentVersion.deleteMany({ where: { status: 'PENDING_UPLOAD' } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deletes PENDING_UPLOAD older than TTL and their S3 objects', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'acme-corp' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });

    const doc = await prisma.document.create({
      data: { name: 'stale.pdf', organizationId: org.id, uploadedById: user.id },
    });
    const oldDate = new Date(Date.now() - 25 * 3600 * 1000);
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        organizationId: org.id,
        versionNumber: 1,
        storageKey: `stale/${doc.id}`,
        originalFilename: 'stale.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        checksumSha256: '',
        status: 'PENDING_UPLOAD',
        uploadedById: user.id,
        createdAt: oldDate,
      },
    });

    const storage = {
      deleteObject: vi.fn(),
      deleteMany: vi.fn(),
      headObject: vi.fn(),
    };
    const result = await cleanupPendingUploads({
      prisma,
      storage,
      ttlHours: 24,
      now: () => new Date(),
    });

    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(storage.deleteMany).toHaveBeenCalled();

    const remaining = await prisma.documentVersion.count({ where: { documentId: doc.id } });
    expect(remaining).toBe(0);
  });
});
