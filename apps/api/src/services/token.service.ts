import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { UserRole } from '@prisma/client';

const payloadSchema = z.object({
  sub: z.string().uuid(),
  org: z.string().uuid(),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
});

export interface AccessTokenPayload {
  sub: string; // userId
  org: string; // organizationId
  role: UserRole;
}

export class TokenService {
  private readonly secret: Uint8Array;
  private readonly ttl: string;

  constructor(env: Env) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.ttl = env.ACCESS_TOKEN_TTL;
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({
      org: payload.org,
      role: payload.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .setJti(crypto.randomUUID())
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      // Verrouillage strict de l'algorithme (bloque alg: none)
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
      });

      // Validation structurelle du payload
      const parsed = payloadSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('Invalid token payload structure');
      }

      return {
        sub: parsed.data.sub,
        org: parsed.data.org,
        role: parsed.data.role,
      };
    } catch {
      // On relance une erreur générique pour ne pas fuiter d'information sur la cause exacte
      throw new Error('Invalid or expired token');
    }
  }
}
