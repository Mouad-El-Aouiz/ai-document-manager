import type { TenantTx } from '../db/with-tenant.js';
import { withTenant } from '../db/with-tenant.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Logger } from 'pino';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'TOKEN_REUSE_DETECTED'
  | 'LOGOUT'
  | 'FOLDER_CREATE'
  | 'FOLDER_UPDATE'
  | 'FOLDER_DELETE'
  | 'FOLDER_MOVE';

export interface AuditEvent {
  action: AuditAction;
  entityType: string;
  entityId: string;
  organizationId: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Version autonome : ouvre sa propre transaction (avec RLS) et écrit l'audit.
   * Utilisée hors `withTenant` (login, logout). Ne fait jamais échouer la requête.
   */
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
      this.logger.error({ err: error, action }, 'Failed to write audit log');
    }
  }

  /**
   * Version transactionnelle : écrit dans la transaction métier.
   * Utilisée dans `withTenant` pour garantir l'atomicité avec l'action.
   */
  async record(tx: TenantTx, event: AuditEvent): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        organizationId: event.organizationId,
        userId: event.actorId,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
