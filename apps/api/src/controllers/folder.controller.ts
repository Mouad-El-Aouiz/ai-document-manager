import type { Request, Response } from 'express';
import { z } from 'zod';
import type { FolderService } from '../services/folder.service.js';
import { AppError } from '../errors/AppError.js';
import type { AccessTokenPayload } from '../services/token.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  parentId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).trim(),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function requireAuth(req: Request): AccessTokenPayload {
  if (!req.auth) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Authentication context missing');
  }
  return req.auth;
}

function requireTenant(req: Request): NonNullable<Request['withTenant']> {
  if (!req.withTenant) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Tenant context not initialized');
  }
  return req.withTenant;
}

export class FolderController {
  constructor(private readonly folderService: FolderService) {}

  async list(req: Request, res: Response): Promise<void> {
    const withTenant = requireTenant(req);
    const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : undefined;
    const folders = await withTenant((tx) => this.folderService.listAll(tx, parentId));
    res.status(200).json({ folders });
  }

  async get(req: Request, res: Response): Promise<void> {
    const withTenant = requireTenant(req);
    const { id } = paramsSchema.parse(req.params);
    const folder = await withTenant((tx) => this.folderService.getById(tx, id));
    res.status(200).json({ folder });
  }

  async create(req: Request, res: Response): Promise<void> {
    const withTenant = requireTenant(req);
    const auth = requireAuth(req);
    const parsed = createSchema.parse(req.body);
    const folder = await withTenant((tx) =>
      this.folderService.create(tx, parsed, auth.org, auth.sub),
    );
    res.status(201).json({ folder });
  }

  async update(req: Request, res: Response): Promise<void> {
    const withTenant = requireTenant(req);
    const auth = requireAuth(req);
    const { id } = paramsSchema.parse(req.params);
    const parsed = updateSchema.parse(req.body);
    const folder = await withTenant((tx) =>
      this.folderService.rename(tx, id, parsed.name, auth.org, auth.sub),
    );
    res.status(200).json({ folder });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const withTenant = requireTenant(req);
    const auth = requireAuth(req);
    const { id } = paramsSchema.parse(req.params);
    await withTenant((tx) => this.folderService.softDelete(tx, id, auth.org, auth.sub));
    res.status(204).send();
  }
}
