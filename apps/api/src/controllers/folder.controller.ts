import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { folderService } from '../services/folder.service.js';
import type { TenantTx } from '../db/with-tenant.js';

export class FolderController {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.withTenant) {
      // Erreur de programmation : middleware manquant sur la route
      throw new AppError(500, 'INTERNAL_ERROR', 'Tenant context not initialized');
    }

    const folders = await req.withTenant((tx: TenantTx) => folderService.listAll(tx));
    res.status(200).json({ folders });
  }
}