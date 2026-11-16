import type { Tag } from '@prisma/client';
import type { TenantTx } from '../db/with-tenant.js';
import { tagRepository } from '../repositories/tag.repository.js';
import { AppError } from '../errors/AppError.js';
import type { AuditService } from './audit.service.js';

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface CreateTagInput {
  name: string;
  color?: string | undefined;
}

export class TagService {
  constructor(private readonly auditService: AuditService) {}

  async list(tx: TenantTx): Promise<Tag[]> {
    return tagRepository.findAll(tx);
  }

  async create(tx: TenantTx, input: CreateTagInput, orgId: string, userId: string): Promise<Tag> {
    const normalized = normalizeTagName(input.name);
    if (normalized.length === 0) throw new AppError(400, 'BAD_REQUEST', 'Tag name cannot be empty');

    const existing = await tx.tag.findFirst({ where: { organizationId: orgId, name: normalized } });
    if (existing) throw new AppError(409, 'CONFLICT', 'Tag already exists');

    const tag = await tagRepository.create(tx, {
      organizationId: orgId,
      name: normalized,
      color: input.color ?? null,
    });

    await this.auditService.record(tx, {
      action: 'TAG_CREATE',
      entityType: 'Tag',
      entityId: tag.id,
      organizationId: orgId,
      actorId: userId,
      metadata: { name: tag.name },
    });

    return tag;
  }

  async update(
    tx: TenantTx,
    id: string,
    input: CreateTagInput,
    orgId: string,
    userId: string,
  ): Promise<Tag> {
    const tag = await tagRepository.findById(tx, id);
    if (!tag) throw new AppError(404, 'NOT_FOUND', 'Tag not found');

    const normalized = normalizeTagName(input.name);
    if (normalized !== tag.name) {
      const existing = await tx.tag.findFirst({
        where: { organizationId: orgId, name: normalized },
      });
      if (existing) throw new AppError(409, 'CONFLICT', 'Tag already exists');
    }

    const updated = await tagRepository.update(tx, id, {
      name: normalized,
      color: input.color ?? null,
    });

    await this.auditService.record(tx, {
      action: 'TAG_UPDATE',
      entityType: 'Tag',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
    });

    return updated;
  }

  async delete(tx: TenantTx, id: string, orgId: string, userId: string): Promise<void> {
    const tag = await tagRepository.findById(tx, id);
    if (!tag) throw new AppError(404, 'NOT_FOUND', 'Tag not found');

    await tagRepository.delete(tx, id);

    await this.auditService.record(tx, {
      action: 'TAG_DELETE',
      entityType: 'Tag',
      entityId: id,
      organizationId: orgId,
      actorId: userId,
    });
  }
}
