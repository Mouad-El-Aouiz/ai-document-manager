import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DocumentUploadService } from '../services/document-upload.service.js';
import { AppError } from '../errors/AppError.js';

const initSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().length(44, 'Must be a base64 encoded SHA-256'),
  folderId: z.string().uuid().nullable().optional(),
});

function getContext(req: Request) {
  if (!req.auth || !req.withTenant) throw new AppError(500, 'INTERNAL_ERROR', 'Context missing');
  return { auth: req.auth, withTenant: req.withTenant };
}

export class DocumentUploadController {
  constructor(private readonly uploadService: DocumentUploadService) {}

  async init(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const parsed = initSchema.parse(req.body);

    // Résolution du problème exactOptionalPropertyTypes
    const result = await withTenant((tx) =>
      this.uploadService.initUpload(
        tx,
        { ...parsed, folderId: parsed.folderId ?? null },
        auth.org,
        auth.sub,
        withTenant,
      ),
    );

    res.status(201).json(result);
  }

  async complete(req: Request, res: Response): Promise<void> {
    const { auth, withTenant } = getContext(req);
    const { versionId } = z.object({ versionId: z.string().uuid() }).parse(req.params);

    await this.uploadService.completeUpload(versionId, auth.org, auth.sub, withTenant);

    res.status(200).json({ status: 'ok' });
  }
}
