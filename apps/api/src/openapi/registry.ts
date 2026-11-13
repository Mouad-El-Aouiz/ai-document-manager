import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registry.register(
  'HealthResponse',
  z.object({
    status: z.literal('ok'),
    checks: z
      .object({
        db: z.enum(['up', 'down']),
        redis: z.enum(['up', 'down']),
      })
      .optional(),
  }),
);

registry.register(
  'ErrorResponse',
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string(),
    }),
  }),
);

registry.register(
  'LoginRequest',
  z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
);

registry.register(
  'LoginResponse',
  z.object({
    accessToken: z.string(),
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
    }),
  }),
);

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Service healthy',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
    },
    503: { description: 'One or more dependencies down' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  responses: { 200: { description: 'Process alive' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
    },
  },
  responses: {
    200: {
      description: 'Login success',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
    },
    429: { description: 'Rate limited' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Current user' }, 401: { description: 'Unauthenticated' } },
});
