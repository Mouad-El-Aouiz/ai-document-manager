import type { AuditLog } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import {
  auditLogRepository,
  type AuditLogListOptions,
} from '../repositories/audit-log.repository.js';

export interface ListAuditLogsInput {
  cursor?: string | undefined;
  limit: number;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface ListAuditLogsResult {
  logs: AuditLog[];
  nextCursor: string | null;
}

export class AuditQueryService {
  async list(tx: TenantTx, input: ListAuditLogsInput): Promise<ListAuditLogsResult> {
    const options: AuditLogListOptions = {
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
      ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
    };

    const rows = await auditLogRepository.findAll(tx, options);
    const hasMore = rows.length > input.limit;
    const logs = hasMore ? rows.slice(0, input.limit) : rows;
    const last = logs[logs.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    return { logs, nextCursor };
  }
}
