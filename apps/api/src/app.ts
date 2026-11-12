import express, { type Express } from 'express';
import type { Env } from './config/env.js';

export interface AppDependencies {
  env: Env;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  // Middleware de base
  app.use(express.json());

  // Route de test temporaire (sera remplacée par /health en 4.4)
  app.get('/', (_req, res) => {
    res.json({ message: 'API is running', env: deps.env.NODE_ENV });
  });

  return app;
}
