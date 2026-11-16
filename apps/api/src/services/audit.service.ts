import { z } from 'zod';
import type { TenantTx } from '../db/with-tenant.js';
import { withTenant } from '../db/with-tenant.js';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { asyncLocalStorage } from '../infra/logger.js';

export const AuditActionSchema = z.enum([
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'TOKEN_REUSE_DETECTED',
  'LOGOUT',
  'FOLDER_CREATE',
  'FOLDER_UPDATE',
  'FOLDER_MOVE',
  'FOLDER_DELETE',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_DOWNLOAD',
  'DOCUMENT_UPDATE',
  'DOCUMENT_DELETE',
  'DOCUMENT_RESTORE',
  'TAG_CREATE',
  'TAG_UPDATE',
  'TAG_DELETE',
  'VERSION_CREATE',
  'VERSION_DELETE',
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export interface AuditEvent {
  action: AuditAction;
  entityType: string;
  entityId: string;
  organizationId: string;
  actorId: string | null;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Version autonome : ouvre sa propre transaction (avec RLS).
   * Utilisée pour les actions hors contexte tenant (login, logout).
   */
  async log(
    action: AuditAction,
    organizationId: string,
    userId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await withTenant(this.prisma, organizationId, async (tx) => {
        const store = asyncLocalStorage.getStore();
        await tx.auditLog.create({
          data: {
            action,
            entityType: 'User',
            entityId: userId ?? 'unknown',
            userId,
            organizationId,
            requestId: store?.requestId ?? null,
            ip: store?.ip ?? null,
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
   * Le requestId et l'ip sont extraits automatiquement du contexte.
   */
  async record(tx: TenantTx, event: AuditEvent): Promise<void> {
    const store = asyncLocalStorage.getStore();
    await tx.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        organizationId: event.organizationId,
        userId: event.actorId,
        requestId: store?.requestId ?? null,
        ip: store?.ip ?? null,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
