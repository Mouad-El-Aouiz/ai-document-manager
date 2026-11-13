import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { TokenService } from './token.service.js';
import { parseEnv } from '../config/env.js';

describe('TokenService', () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ORIGINS: 'http://localhost:3000',
  });

  const service = new TokenService(env);

  const validPayload = {
    sub: '123e4567-e89b-12d3-a456-426614174000',
    org: '123e4567-e89b-12d3-a456-426614174001',
    role: 'ADMIN' as const,
  };

  it('should sign and verify a valid token', async () => {
    const token = await service.signAccessToken(validPayload);
    expect(token).toBeDefined();

    const decoded = await service.verifyAccessToken(token);
    expect(decoded).toEqual(validPayload);
  });

  it('should reject a token signed with a different secret', async () => {
    const otherSecret = new TextEncoder().encode('c'.repeat(32));
    const badToken = await new SignJWT({ org: validPayload.org, role: validPayload.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(validPayload.sub)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(otherSecret);

    await expect(service.verifyAccessToken(badToken)).rejects.toThrow('Invalid or expired token');
  });

  it('should reject a token with alg: none', async () => {
    // Un token "alg: none" est une tentative de contournement de signature
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: validPayload.sub, org: validPayload.org, role: validPayload.role }),
    ).toString('base64url');
    const maliciousToken = `${header}.${payload}.`;

    await expect(service.verifyAccessToken(maliciousToken)).rejects.toThrow();
  });

  it('should reject an expired token', async () => {
    const expiredSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const expiredToken = await new SignJWT({ org: validPayload.org, role: validPayload.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(validPayload.sub)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // Expiré depuis 30 min
      .sign(expiredSecret);

    await expect(service.verifyAccessToken(expiredToken)).rejects.toThrow(
      'Invalid or expired token',
    );
  });

  it('should reject a token with a malformed payload', async () => {
    const token = await new SignJWT({ org: 'not-a-uuid', role: 'INVALID_ROLE' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(validPayload.sub)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    await expect(service.verifyAccessToken(token)).rejects.toThrow('Invalid or expired token');
  });
});
