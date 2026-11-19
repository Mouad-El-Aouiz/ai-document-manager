import { Router } from 'express';
import { generateOpenApiDocument } from '../openapi/document.js';
import type { Env } from '../config/env.js';

export function docsRouter(env: Env): Router {
  const router = Router();
  const doc = generateOpenApiDocument();

  // On retire le '/docs' du path car il est déjà dans app.use('/api/v1/docs', ...)
  router.get('/', (req, res) => {
    res.json(doc);
  });

  if (env.NODE_ENV !== 'production') {
    router.get('/ui', (req, res) => {
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
