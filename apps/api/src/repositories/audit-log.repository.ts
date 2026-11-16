import type { Prisma, AuditLog } from '@prisma/client';
import type { TenantTx } from '@aidm/shared';

export interface AuditLogListOptions {
  cursor?: string | undefined;
  limit: number;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export interface AuditLogRepository {
  findAll(tx: TenantTx, options: AuditLogListOptions): Promise<AuditLog[]>;
}

export const auditLogRepository: AuditLogRepository = {
  findAll: async (tx, options) => {
    const where: Prisma.AuditLogWhereInput = {};

    if (options.action !== undefined) where.action = options.action;
    if (options.entityType !== undefined) where.entityType = options.entityType;
    if (options.entityId !== undefined) where.entityId = options.entityId;
    if (options.actorId !== undefined) where.userId = options.actorId;
    if (options.startDate !== undefined || options.endDate !== undefined) {
      where.createdAt = {
        ...(options.startDate !== undefined ? { gte: options.startDate } : {}),
        ...(options.endDate !== undefined ? { lte: options.endDate } : {}),
      };
    }

    return tx.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor !== undefined ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  },
};
