import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type Logger } from 'pino';
import type { Env } from '../config/env.js';

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export function createLogger(env: Env): Logger {
  const isDev = env.NODE_ENV === 'development';

  const transport = isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.refreshToken',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    mixin: () => {
      const store = asyncLocalStorage.getStore();
      return store ?? {};
    },
    ...(transport ? { transport } : {}),
  });
}
