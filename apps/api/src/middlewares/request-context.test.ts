import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { requestContext } from './request-context.js';

describe('Request Context Middleware', () => {
  const createTestApp = (): Express => {
    const app = express();
    app.use(requestContext());
    app.get('/', (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  };

  it('should generate a new X-Request-Id if none is provided', async () => {
    const app = createTestApp();
    const response = await request(app).get('/');

    expect(response.headers['x-request-id']).toBeDefined();
    // Vérifie que c'est un UUID valide (format basique)
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should reuse the incoming X-Request-Id if it is a valid UUID', async () => {
    const app = createTestApp();
    const customId = '123e4567-e89b-12d3-a456-426614174000';
    const response = await request(app).get('/').set('X-Request-Id', customId);

    expect(response.headers['x-request-id']).toBe(customId);
  });

  it('should generate a new X-Request-Id if the incoming one is invalid', async () => {
    const app = createTestApp();
    const invalidId = 'not-a-uuid-format'; // Valide pour HTTP, invalide pour Zod

    const response = await request(app).get('/').set('X-Request-Id', invalidId);

    expect(response.headers['x-request-id']).not.toBe(invalidId);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
