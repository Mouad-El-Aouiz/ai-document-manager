import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticate } from './authenticate.js';
import { parseEnv } from '../config/env.js';
import { TokenService } from '../services/token.service.js';
import { errorHandler } from './error-handler.js';
import { createLogger } from '../infra/logger.js';

describe('authenticate middleware', () => {
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

  const tokenService = new TokenService(env);
  const app = express();
  app.use(authenticate(env));
  app.get('/protected', (req, res) => {
    res.json({ auth: req.auth });
  });
  app.use(errorHandler(logger)); // Ajout crucial pour le formatage des erreurs

  it('should return 401 if no authorization header is present', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('should return 401 if the token is invalid', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('should attach req.auth and call next if the token is valid', async () => {
    const token = await tokenService.signAccessToken({
      sub: '123e4567-e89b-12d3-a456-426614174000',
      org: '123e4567-e89b-12d3-a456-426614174001',
      role: 'EDITOR',
    });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({
      sub: '123e4567-e89b-12d3-a456-426614174000',
      org: '123e4567-e89b-12d3-a456-426614174001',
      role: 'EDITOR',
    });
  });
});
