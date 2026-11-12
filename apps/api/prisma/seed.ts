import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) {
  throw new Error('DATABASE_URL_MIGRATE is required to run the seed');
}

const prisma = new PrismaClient({ datasourceUrl: migrateUrl });

async function main() {
  const passwordHashAlice = await argon2.hash('alice');
  const passwordHashBob = await argon2.hash('bob');

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { slug: 'acme-corp' },
      update: {},
      create: {
        name: 'Acme Corp',
        slug: 'acme-corp',
        plan: 'FREE',
      },
    });

    const alice = await tx.user.upsert({
      where: { email: 'alice@acme.com' },
      update: {},
      create: {
        email: 'alice@acme.com',
        passwordHash: passwordHashAlice,
        role: 'ADMIN',
        organizationId: org.id,
      },
    });

    await tx.user.upsert({
      where: { email: 'bob@acme.com' },
      update: {},
      create: {
        email: 'bob@acme.com',
        passwordHash: passwordHashBob,
        role: 'EDITOR',
        organizationId: org.id,
      },
    });

    const contractsFolder = await tx.folder.upsert({
      where: { id: 'seed-folder-contracts' },
      update: {},
      create: {
        id: 'seed-folder-contracts',
        name: 'Contrats',
        organizationId: org.id,
        createdById: alice.id,
      },
    });

    await tx.document.upsert({
      where: { id: 'seed-document-placeholder' },
      update: {},
      create: {
        id: 'seed-document-placeholder',
        name: 'placeholder.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 0,
        storagePath: 'seed/placeholder.pdf',
        status: 'PENDING',
        folderId: contractsFolder.id,
        organizationId: org.id,
        uploadedById: alice.id,
      },
    });

    console.log('Seed completed:', {
      organization: org.slug,
      users: ['alice@acme.com', 'bob@acme.com'],
      folder: contractsFolder.name,
      document: 'placeholder.pdf',
    });
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
