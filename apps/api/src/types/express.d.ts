import type { AccessTokenPayload } from '../services/token.service.js';
import type { TenantTx } from '../db/with-tenant.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      withTenant?: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>;
    }
  }
}

export {};
