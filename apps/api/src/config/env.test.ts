import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('Environment Validation', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  };

  it('should parse and freeze valid env', () => {
    const result = parseEnv(validEnv);
    expect(result.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('should throw if secret is too short', () => {
    const invalidEnv = { ...validEnv, JWT_ACCESS_SECRET: 'too-short' };
    expect(() => parseEnv(invalidEnv)).toThrow('Invalid environment variables');
  });

  it('should throw if required variable is missing', () => {
    const { DATABASE_URL: _, ...invalidEnv } = validEnv;
    expect(() => parseEnv(invalidEnv)).toThrow('Invalid environment variables');
  });
});
