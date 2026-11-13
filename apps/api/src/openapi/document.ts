import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.js';

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'AI Document Manager API',
      version: 'v1',
      description: 'API de gestion documentaire multi-tenant.',
    },
    servers: [{ url: '/' }],
  });
}
