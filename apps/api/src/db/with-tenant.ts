import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export type TenantTx = Prisma.TransactionClient;

/**
 * Exécute une fonction dans une transaction sécurisée par RLS.
 * Configure `app.organization_id` pour le contexte de la transaction.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  // 1. Validation stricte de l'ID
  const parsedOrgId = uuidSchema.parse(organizationId);

  // 2. Transaction isolée
  return prisma.$transaction(async (tx) => {
    // 3. Injection du contexte de sécurité (SET LOCAL équivalent)
    // Le 3ème paramètre `true` signifie que la configuration est locale à la transaction.
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${parsedOrgId}, true)`;
    
    // 4. Exécution de la logique métier
    return fn(tx);
  });
}