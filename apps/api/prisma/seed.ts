import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) {
  throw new Error('DATABASE_URL_MIGRATE is required to run the seed');
}

const prisma = new PrismaClient({ datasourceUrl: migrateUrl });

async function main(): Promise<void> {
  const [aliceHash, bobHash, charlieHash] = await Promise.all([
    argon2.hash('alice'),
    argon2.hash('bob'),
    argon2.hash('charlie'),
  ]);

  await prisma.$transaction(async (tx) => {
    // ─── Org 1 : Acme Corp ───
    const acme = await tx.organization.upsert({
      where: { slug: 'acme-corp' },
      update: {},
      create: { name: 'Acme Corp', slug: 'acme-corp', plan: 'FREE' },
    });

    const alice = await tx.user.upsert({
      where: { email: 'alice@acme.com' },
      update: {},
      create: {
        email: 'alice@acme.com',
        passwordHash: aliceHash,
        role: 'ADMIN',
        organizationId: acme.id,
      },
    });

    await tx.user.upsert({
      where: { email: 'bob@acme.com' },
      update: {},
      create: {
        email: 'bob@acme.com',
        passwordHash: bobHash,
        role: 'EDITOR',
        organizationId: acme.id,
      },
    });

    // Arborescence : Contrats > 2025 > Clients
    const contracts = await tx.folder.upsert({
      where: { id: 'seed-folder-contracts' },
      update: {},
      create: {
        id: 'seed-folder-contracts',
        name: 'Contrats',
        organizationId: acme.id,
        createdById: alice.id,
      },
    });

    const contracts2025 = await tx.folder.upsert({
      where: { id: 'seed-folder-contracts-2025' },
      update: {},
      create: {
        id: 'seed-folder-contracts-2025',
        name: '2025',
        organizationId: acme.id,
        createdById: alice.id,
        parentId: contracts.id,
      },
    });

    await tx.folder.upsert({
      where: { id: 'seed-folder-contracts-2025-clients' },
      update: {},
      create: {
        id: 'seed-folder-contracts-2025-clients',
        name: 'Clients',
        organizationId: acme.id,
        createdById: alice.id,
        parentId: contracts2025.id,
      },
    });

    // Tags
    const urgent = await tx.tag.upsert({
      where: { organizationId_name: { organizationId: acme.id, name: 'urgent' } },
      update: {},
      create: { organizationId: acme.id, name: 'urgent', color: '#FF0000' },
    });

    const finance = await tx.tag.upsert({
      where: { organizationId_name: { organizationId: acme.id, name: 'finance' } },
      update: {},
      create: { organizationId: acme.id, name: 'finance', color: '#00AA00' },
    });

    // Document avec 2 versions
    const docId = 'seed-document-contract-001';
    const existingDoc = await tx.document.findUnique({ where: { id: docId } });

    if (!existingDoc) {
      // 1. Créer le Document en premier (sans currentVersionId, la FK composite l'exige)
      await tx.document.create({
        data: {
          id: docId,
          name: 'Contrat Acme 2025.pdf',
          folderId: contracts2025.id,
          organizationId: acme.id,
          uploadedById: alice.id,
          metadata: { author: 'Alice', year: 2025, category: 'contract' },
        },
      });

      // 2. Créer les versions (le Document existe maintenant)
      await tx.documentVersion.create({
        data: {
          documentId: docId,
          organizationId: acme.id,
          versionNumber: 1,
          storageKey: `org/${acme.id}/doc/${docId}/v/v1`,
          originalFilename: 'contrat-acme-v1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12345,
          checksumSha256: '',
          status: 'READY',
          uploadedById: alice.id,
        },
      });

      const v2 = await tx.documentVersion.create({
        data: {
          documentId: docId,
          organizationId: acme.id,
          versionNumber: 2,
          storageKey: `org/${acme.id}/doc/${docId}/v/v2`,
          originalFilename: 'contrat-acme-v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 13000,
          checksumSha256: '',
          status: 'READY',
          uploadedById: alice.id,
        },
      });

      // 3. Mettre à jour currentVersionId
      await tx.document.update({
        where: { id: docId },
        data: { currentVersionId: v2.id },
      });

      // 4. Associer les tags
      await tx.documentTag.createMany({
        data: [
          { documentId: docId, tagId: urgent.id },
          { documentId: docId, tagId: finance.id },
        ],
      });
    }

    // ─── Org 2 : Beta Corp ───
    const beta = await tx.organization.upsert({
      where: { slug: 'beta-corp' },
      update: {},
      create: { name: 'Beta Corp', slug: 'beta-corp', plan: 'PRO' },
    });

    const charlie = await tx.user.upsert({
      where: { email: 'charlie@beta.com' },
      update: {},
      create: {
        email: 'charlie@beta.com',
        passwordHash: charlieHash,
        role: 'ADMIN',
        organizationId: beta.id,
      },
    });

    await tx.folder.upsert({
      where: { id: 'seed-folder-beta' },
      update: {},
      create: {
        id: 'seed-folder-beta',
        name: 'Dossier Beta',
        organizationId: beta.id,
        createdById: charlie.id,
      },
    });

    console.log('Seed completed: Acme Corp + Beta Corp ready (users, folders, tags, versions).');
  });
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
