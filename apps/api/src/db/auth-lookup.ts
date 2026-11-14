import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export interface AuthUser {
  id: string;
  organizationId: string;
  passwordHash: string;
  role: string;
}

const authUserSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  password_hash: z.string(),
  role: z.string(),
});

export async function authLookupUser(
  prisma: PrismaClient,
  email: string,
): Promise<AuthUser | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT id, organization_id, password_hash, role
    FROM auth_lookup_user(${normalizedEmail})
  `;

  if (rows.length === 0) return null;

  const parsed = authUserSchema.safeParse(rows[0]);
  if (!parsed.success) throw new Error('Invalid user record returned by auth_lookup_user');

  return {
    id: parsed.data.id,
    organizationId: parsed.data.organization_id,
    passwordHash: parsed.data.password_hash,
    role: parsed.data.role,
  };
}
