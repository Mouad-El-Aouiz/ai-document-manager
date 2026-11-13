import { Router } from 'express';
import { generateOpenApiDocument } from '../openapi/document.js';
import type { Env } from '../config/env.js';

export function docsRouter(env: Env): Router {
  const router = Router();
  const doc = generateOpenApiDocument();

  router.get('/docs', (req, res) => {
    res.json(doc);
  });

  // En dev, on ajoute une UI simple
  if (env.NODE_ENV !== 'production') {
    router.get('/docs/ui', (req, res) => {
      res.send(`<!DOCTYPE html>
<html><head><title>API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/v1/docs', dom_id: '#swagger-ui' });</script>
</body></html>`);
    });
  }

  return router;
}
