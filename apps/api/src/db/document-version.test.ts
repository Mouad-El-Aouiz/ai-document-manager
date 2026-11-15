import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withTenant } from './with-tenant.js';
import { randomUUID } from 'node:crypto';

const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL required');
const appPrisma = new PrismaClient({ datasourceUrl: appUrl });

const adminUrl = process.env.DATABASE_URL_MIGRATE;
if (!adminUrl) throw new Error('DATABASE_URL_MIGRATE required');
const adminPrisma = new PrismaClient({ datasourceUrl: adminUrl });

describe('DocumentVersion Schema & RLS', () => {
  let orgId = '';
  let userId = '';
  let docId = '';

  beforeAll(async () => {
    const org = await adminPrisma.organization.findUniqueOrThrow({ where: { slug: 'acme-corp' } });
    const user = await adminPrisma.user.findUniqueOrThrow({ where: { email: 'alice@acme.com' } });
    orgId = org.id;
    userId = user.id;
  });

  afterAll(async () => {
    if (docId) {
      await adminPrisma.document.deleteMany({ where: { id: docId } });
    }
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
  });

  it('should create a document and its first version', async () => {
    const testDocId = randomUUID();
    const testVersionId = randomUUID();

    await withTenant(appPrisma, orgId, async (tx) => {
      await tx.document.create({
        data: {
          id: testDocId,
          name: 'test.pdf',
          organizationId: orgId,
          uploadedById: userId,
        },
      });

      await tx.documentVersion.create({
        data: {
          id: testVersionId,
          documentId: testDocId,
          organizationId: orgId,
          versionNumber: 1,
          storageKey: 'path/to/file.pdf',
          originalFilename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          checksumSha256: 'abc',
          status: 'UPLOADED',
          uploadedById: userId,
        },
      });

      await tx.document.update({
        where: { id: testDocId },
        data: { currentVersionId: testVersionId },
      });
    });

    const doc = await adminPrisma.document.findUniqueOrThrow({
      where: { id: testDocId },
      include: { currentVersion: true },
    });
    expect(doc.currentVersionId).toBe(testVersionId);
    expect(doc.currentVersion?.originalFilename).toBe('test.pdf');

    docId = testDocId;
  });

  it('should enforce unique versionNumber per document', async () => {
    await expect(
      withTenant(appPrisma, orgId, async (tx) => {
        await tx.documentVersion.create({
          data: {
            documentId: docId,
            organizationId: orgId,
            versionNumber: 1,
            storageKey: 'path/to/dup.pdf',
            originalFilename: 'dup.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 100,
            checksumSha256: 'def',
            status: 'UPLOADED',
            uploadedById: userId,
          },
        });
      }),
    ).rejects.toThrow(/Unique constraint/i);
  });

  it('should enforce RLS isolation on DocumentVersion', async () => {
    const otherOrg = await adminPrisma.organization.findUniqueOrThrow({
      where: { slug: 'beta-corp' },
    });

    const versions = await withTenant(appPrisma, otherOrg.id, async (tx) => {
      return tx.documentVersion.findMany({ where: { documentId: docId } });
    });

    expect(versions).toHaveLength(0);
  });

  it('should prevent aidm_app from deleting a DocumentVersion', async () => {
    const versions = await adminPrisma.documentVersion.findMany({ where: { documentId: docId } });
    const versionId = versions[0]?.id;
    if (!versionId) throw new Error('No version found');

    await expect(
      withTenant(appPrisma, orgId, async (tx) => {
        await tx.documentVersion.delete({ where: { id: versionId } });
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
