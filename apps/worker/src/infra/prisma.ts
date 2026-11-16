import { PrismaClient } from '@prisma/client';

export function createWorkerPrisma(): PrismaClient {
  // Le worker utilise DATABASE_URL_WORKER si défini (rôle dédié), sinon
  // DATABASE_URL_MIGRATE (superuser). Voir docs/adr/0011.
  const url = process.env.DATABASE_URL_WORKER ?? process.env.DATABASE_URL_MIGRATE;
  if (!url) {
    throw new Error('DATABASE_URL_WORKER or DATABASE_URL_MIGRATE must be set');
  }

  return new PrismaClient({
    datasourceUrl: url,
    log: ['error', 'warn'],
  });
}
