import type { Request, Response } from 'express';
import { z } from 'zod';
import type { TagService } from '../services/tag.service.js';
import { AppError } from '../errors/AppError.js';
import type { AccessTokenPayload } from '../services/token.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
const paramsSchema = z.object({ id: z.string().uuid() });

function requireContext(req: Request): {
  auth: AccessTokenPayload;
  withTenant: NonNullable<Request['withTenant']>;
} {
  if (!req.auth || !req.withTenant) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Context missing');
  }
  return { auth: req.auth, withTenant: req.withTenant };
}

export class TagController {
  constructor(private readonly tagService: TagService) {}

  async list(req: Request, res: Response): Promise<void> {
    const { withTenant } = requireContext(req);
    const tags = await withTenant((tx) => this.tagService.list(tx));
    res.status(200).json({ tags });
  }

  async create(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const parsed = createSchema.parse(req.body);
    const tag = await withTenant((tx) => this.tagService.create(tx, parsed, auth.org, auth.sub));
    res.status(201).json({ tag });
  }

  async update(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const parsed = createSchema.parse(req.body);
    const tag = await withTenant((tx) => this.tagService.update(tx, id, parsed, auth.org, auth.sub));
    res.status(200).json({ tag });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    await withTenant((tx) => this.tagService.delete(tx, id, auth.org, auth.sub));
    res.status(204).send();
  }
}