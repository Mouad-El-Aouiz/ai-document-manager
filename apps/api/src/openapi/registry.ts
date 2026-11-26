import { z } from '../infra/z.js';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
registry.register('ErrorResponse', ErrorSchema);

// ───────── Health ─────────
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  responses: {
    200: { description: 'Service healthy' },
    503: { description: 'Dependency down' },
  },
});
registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  responses: { 200: { description: 'Process alive' } },
});

// ───────── Auth ─────────
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
    user: z.object({ id: z.string(), email: z.string(), role: z.string() }),
  }),
);
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
      description: 'OK',
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
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  responses: { 200: { description: 'OK' }, 401: { description: 'Invalid refresh token' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  responses: { 204: { description: 'Logged out' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Current user' }, 401: { description: 'Unauthenticated' } },
});

// ───────── Folders ─────────
const FolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  organizationId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
registry.register('Folder', FolderSchema);
registry.register(
  'CreateFolderRequest',
  z.object({
    name: z.string().min(1).max(255),
    parentId: z.string().uuid().nullable().optional(),
  }),
);
registry.register('MoveFolderRequest', z.object({ parentId: z.string().uuid().nullable() }));
registry.registerPath({
  method: 'get',
  path: '/api/v1/folders',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ parentId: z.string().optional() }) },
  responses: { 200: { description: 'List folders' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/folders',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateFolderRequest' } },
      },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: z.object({ folder: FolderSchema }) } },
    },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/folders/{id}',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Folder' }, 404: { description: 'Not found' } },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/folders/{id}',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } },
  },
  responses: { 200: { description: 'Updated' } },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/folders/{id}/move',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/MoveFolderRequest' } },
      },
    },
  },
  responses: { 200: { description: 'Moved' }, 400: { description: 'Cycle or depth exceeded' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/folders/{id}/breadcrumb',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Breadcrumb' } },
});
registry.registerPath({
  method: 'delete',
  path: '/api/v1/folders/{id}',
  tags: ['Folders'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Soft deleted' } },
});

// ───────── Documents ─────────
registry.register(
  'InitUploadRequest',
  z.object({
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().positive(),
    sha256: z.string(),
    folderId: z.string().uuid().nullable().optional(),
  }),
);
registry.register(
  'InitUploadResponse',
  z.object({
    documentId: z.string(),
    versionId: z.string(),
    uploadUrl: z.string(),
  }),
);
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents/uploads',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/InitUploadRequest' } },
      },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/InitUploadResponse' } },
      },
    },
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents/uploads/{versionId}/complete',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ versionId: z.string().uuid() }) },
  responses: {
    200: { description: 'Confirmed' },
    400: { description: 'Checksum or size mismatch' },
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.string().optional(),
      folderId: z.string().optional(),
      q: z.string().optional(),
      tag: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated list' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{id}',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Document' }, 404: { description: 'Not found' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{id}/download',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Presigned URL' } },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/documents/{id}',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().optional(),
            folderId: z.string().uuid().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: 'Updated' } },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/documents/{id}/metadata',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Metadata updated' } },
});
registry.registerPath({
  method: 'put',
  path: '/api/v1/documents/{id}/tags',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: z.object({ tagIds: z.array(z.string().uuid()) }) } },
    },
  },
  responses: { 200: { description: 'Tags replaced' } },
});
registry.registerPath({
  method: 'delete',
  path: '/api/v1/documents/{id}',
  tags: ['Documents'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Soft deleted' } },
});

// ───────── Versions ─────────
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{id}/versions',
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Version list' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents/{id}/versions',
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/InitUploadRequest' } },
      },
    },
  },
  responses: { 201: { description: 'New version pending' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents/{id}/versions/{versionId}/complete',
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }) },
  responses: { 200: { description: 'Confirmed' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/v1/documents/{id}/versions/{versionId}/download',
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }) },
  responses: { 200: { description: 'Presigned URL' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents/{id}/versions/{versionId}/restore',
  tags: ['Versions'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }) },
  responses: { 201: { description: 'Restored as new version' } },
});

// ───────── Tags ─────────
registry.register(
  'Tag',
  z.object({
    id: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    organizationId: z.string(),
  }),
);
registry.register(
  'CreateTagRequest',
  z.object({
    name: z.string().min(1).max(50),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
  }),
);
registry.registerPath({
  method: 'get',
  path: '/api/v1/tags',
  tags: ['Tags'],
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'List tags' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/tags',
  tags: ['Tags'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateTagRequest' } },
      },
    },
  },
  responses: { 201: { description: 'Created' }, 409: { description: 'Duplicate' } },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/tags/{id}',
  tags: ['Tags'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateTagRequest' } },
      },
    },
  },
  responses: { 200: { description: 'Updated' } },
});
registry.registerPath({
  method: 'delete',
  path: '/api/v1/tags/{id}',
  tags: ['Tags'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ───────── Audit ─────────
registry.registerPath({
  method: 'get',
  path: '/api/v1/audit-logs',
  tags: ['Audit'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.string().optional(),
      action: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      actorId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'Paginated audit logs' },
    403: { description: 'Forbidden (ADMIN only)' },
  },
});
