import type { PrismaClient, Prisma } from '@prisma/client';
import { withTenant } from '../db/with-tenant.js';
import type { Logger } from 'pino';

export type AuditAction = 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'TOKEN_REUSE_DETECTED' | 'LOGOUT';

export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async log(
    action: AuditAction,
    organizationId: string,
    userId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await withTenant(this.prisma, organizationId, async (tx) => {
        await tx.auditLog.create({
          data: {
            action,
            entityType: 'User',
            entityId: userId ?? 'unknown',
            userId,
            organizationId,
            metadata: metadata as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error: unknown) {
      // L'audit ne doit jamais faire échouer la requête principale
      this.logger.error({ err: error, action }, 'Failed to write audit log');
    }
  }
}
