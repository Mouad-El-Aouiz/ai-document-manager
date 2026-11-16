import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuditQueryService } from '../services/audit-query.service.js';
import { AppError } from '../errors/AppError.js';

const querySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

function getContext(req: Request) {
  if (!req.withTenant) throw new AppError(500, 'INTERNAL_ERROR', 'Context missing');
  return req.withTenant;
}

export class AuditController {
  constructor(private readonly queryService: AuditQueryService) {}

  async list(req: Request, res: Response): Promise<void> {
    const withTenant = getContext(req);
    const parsed = querySchema.parse(req.query);
    const result = await withTenant((tx) => this.queryService.list(tx, parsed));
    res.status(200).json(result);
  }
}
