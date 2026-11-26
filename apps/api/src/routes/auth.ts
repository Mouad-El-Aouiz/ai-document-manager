import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { createLoginRateLimiter } from '../middlewares/rate-limiter.js';
import { authenticate } from '../middlewares/authenticate.js';

export function authRouter(controller: AuthController, redis: Redis, env: Env): Router {
  const router = Router();
  const loginLimiter = createLoginRateLimiter(redis, env);

  router.post('/login', loginLimiter, controller.login.bind(controller));
  router.post('/refresh', controller.refresh.bind(controller));
  router.post('/logout', controller.logout.bind(controller));
  router.get('/me', authenticate(env), controller.me.bind(controller));

  return router;
}