import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DocumentUploadService } from '../services/document-upload.service.js';
import type { DocumentVersionService } from '../services/document-version.service.js';
import { AppError } from '../errors/AppError.js';

const initVersionSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(44, 'Must be a base64 encoded SHA-256'),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

const docParamsSchema = z.object({
  id: z.string().uuid(),
});

const versionParamsSchema = z.object({
  versionId: z.string().uuid(),
});

function getContext(req: Request) {
  if (!req.auth || !req.withTenant) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Context missing');
  }
  return { auth: req.auth, withTenant: req.withTenant };
}

export class DocumentVersionController {
  constructor(
    private readonly uploadService: DocumentUploadService,
    private readonly versionService: DocumentVersionService,
  ) {}

  async init(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const { id } = docParamsSchema.parse(req.params);
    const parsed = initVersionSchema.parse(req.body);

    const result = await withTenant((tx) =>
      this.uploadService.initNewVersion(tx, id, parsed, auth.org, auth.sub, withTenant),
    );

    res.status(201).json(result);
  }

  async complete(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const { versionId } = versionParamsSchema.parse(req.params);

    await this.uploadService.completeUpload(versionId, auth.org, auth.sub, withTenant);
    res.status(200).json({ status: 'ok' });
  }

  async list(req: Request, res: Response): Promise<void> {
    const { withTenant } = getContext(req);
    const { id } = docParamsSchema.parse(req.params);

    const versions = await withTenant((tx) => this.versionService.list(tx, id));
    res.status(200).json({ versions });
  }

  async download(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const { id, versionId } = paramsSchema.parse(req.params);

    const result = await withTenant((tx) =>
      this.versionService.download(tx, id, versionId, auth.org, auth.sub),
    );
    res.status(200).json(result);
  }

  async restore(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const { id, versionId } = paramsSchema.parse(req.params);

    const newVersion = await withTenant((tx) =>
      this.versionService.restore(tx, id, versionId, auth.org, auth.sub, withTenant),
    );
    res.status(201).json({ version: newVersion });
  }
}
