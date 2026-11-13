import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requirePermission } from './rbac.js';
import type { UserRole } from '@prisma/client';
import { errorHandler } from './error-handler.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../infra/logger.js';

describe('rbac middleware', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
  });
  const logger = createLogger(env);
  logger.level = 'silent';

  function createTestApp(role: UserRole, permission: string) {
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { sub: 'user-id', org: 'org-id', role };
      next();
    });
    app.get('/test', requirePermission(permission), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler(logger)); // Ajout crucial
    return app;
  }

  it('should allow ADMIN to access everything', async () => {
    const app = createTestApp('ADMIN', 'any:permission');
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('should allow EDITOR to write a document', async () => {
    const app = createTestApp('EDITOR', 'document:write');
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('should forbid VIEWER from writing a document', async () => {
    const app = createTestApp('VIEWER', 'document:write');
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should return 401 if req.auth is missing', async () => {
    const app = express();
    app.get('/test', requirePermission('any'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler(logger)); // Ajout crucial
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
  });
});
