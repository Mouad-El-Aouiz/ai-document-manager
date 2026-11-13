import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';
import { parseEnv } from '../config/env.js';

describe('PasswordService', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
    ARGON2_MEMORY_COST: '4096', // Rapide pour les tests
    ARGON2_TIME_COST: '2',
  });

  const service = new PasswordService(env);

  it('should hash and verify a password', async () => {
    const password = 'super-secret-password';
    const hash = await service.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toContain('$argon2id$');
    expect(await service.verify(hash, password)).toBe(true);
    expect(await service.verify(hash, 'wrong-password')).toBe(false);
  });

  it('should handle invalid hash gracefully', async () => {
    expect(await service.verify('not-a-valid-hash', 'password')).toBe(false);
  });

  it('should execute verifyDummy without throwing', async () => {
    await expect(service.verifyDummy()).resolves.toBeUndefined();
  });
});
