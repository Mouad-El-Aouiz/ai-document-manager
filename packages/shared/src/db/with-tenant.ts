import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export type TenantTx = Prisma.TransactionClient;

export function withTenant<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  const parsedOrgId = uuidSchema.parse(organizationId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${parsedOrgId}, true)`;
    return fn(tx);
  });
}
