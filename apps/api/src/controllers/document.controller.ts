import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DocumentService } from '../services/document.service.js';
import { AppError } from '../errors/AppError.js';
import type { AccessTokenPayload } from '../services/token.service.js';

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  folderId: z.string().optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
});

const paramsSchema = z.object({ id: z.string().uuid() });

const updateSchema = z
  .object({
    name: z.string().min(1).max(255).trim().optional(),
    folderId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.folderId !== undefined, {
    message: 'At least one field must be provided',
  });

const metadataBodySchema = z.object({
  metadata: z.record(z.string().max(50), z.union([z.string().max(500), z.number(), z.boolean()])),
});

const tagsBodySchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

function requireContext(req: Request): {
  auth: AccessTokenPayload;
  withTenant: NonNullable<Request['withTenant']>;
} {
  if (!req.auth || !req.withTenant) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Context missing');
  }
  return { auth: req.auth, withTenant: req.withTenant };
}

export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  async list(req: Request, res: Response): Promise<void> {
    const { withTenant } = requireContext(req);
    const parsed = listQuerySchema.parse(req.query);

    let folderId: string | null | undefined;
    if (parsed.folderId === undefined) folderId = undefined;
    else if (parsed.folderId === 'null') folderId = null;
    else folderId = parsed.folderId;

    const result = await withTenant((tx) =>
      this.documentService.list(tx, {
        cursor: parsed.cursor,
        limit: parsed.limit,
        folderId,
        q: parsed.q,
        tagName: parsed.tag,
      }),
    );
    res.status(200).json(result);
  }

  async get(req: Request, res: Response): Promise<void> {
    const { withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const document = await withTenant((tx) => this.documentService.getById(tx, id));
    res.status(200).json({ document });
  }

  async download(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const { url } = await withTenant((tx) =>
      this.documentService.download(tx, id, auth.org, auth.sub),
    );
    res.status(200).json({ url });
  }

  async update(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const parsed = updateSchema.parse(req.body);
    const document = await withTenant((tx) =>
      this.documentService.update(tx, id, parsed, auth.org, auth.sub),
    );
    res.status(200).json({ document });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    await withTenant((tx) => this.documentService.softDelete(tx, id, auth.org, auth.sub));
    res.status(204).send();
  }

  async updateMetadata(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const body = metadataBodySchema.parse(req.body);
    const document = await withTenant((tx) =>
      this.documentService.updateMetadata(tx, id, body.metadata, auth.org, auth.sub),
    );
    res.status(200).json({ document });
  }

  async updateTags(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = requireContext(req);
    const { id } = paramsSchema.parse(req.params);
    const { tagIds } = tagsBodySchema.parse(req.body);
    const document = await withTenant((tx) =>
      this.documentService.updateTags(tx, id, tagIds, auth.org, auth.sub),
    );
    res.status(200).json({ document });
  }
}
