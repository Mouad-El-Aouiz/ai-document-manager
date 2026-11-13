import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

export type RefreshTokenUser = Pick<User, 'id' | 'organizationId'>;

export interface RotationResult {
  refreshToken: string;
  userId: string;
  organizationId: string;
}

export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private calculateExpiry(): Date {
    const ttl = this.env.REFRESH_TOKEN_TTL;
    const match = /^(\d+)([dmh])$/.exec(ttl);
    if (!match) throw new Error(`Invalid REFRESH_TOKEN_TTL format: ${ttl}`);

    const value = parseInt(match[1] ?? '0', 10);
    const unit = match[2];
    const ms = unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000;
    return new Date(Date.now() + ms);
  }

  async issueInitialToken(
    user: RefreshTokenUser,
    ip?: string,
    userAgent?: string,
  ): Promise<string> {
    const familyId = crypto.randomUUID();
    return this.createTokenRecord(user, familyId, ip, userAgent);
  }

  async rotateToken(rawToken: string, ip?: string, userAgent?: string): Promise<RotationResult> {
    const tokenHash = this.hashToken(rawToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid refresh token');
    }

    if (storedToken.consumedAt !== null || storedToken.revokedAt !== null) {
      await this.revokeFamily(storedToken.familyId);
      throw new AppError(401, 'UNAUTHENTICATED', 'Token reuse detected. Session revoked.');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Refresh token expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { consumedAt: new Date() },
    });

    const newRawToken = await this.createTokenRecord(
      { id: storedToken.userId, organizationId: storedToken.organizationId },
      storedToken.familyId,
      ip,
      userAgent,
    );

    return {
      refreshToken: newRawToken,
      userId: storedToken.userId,
      organizationId: storedToken.organizationId,
    };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createTokenRecord(
    user: RefreshTokenUser,
    familyId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<string> {
    const rawToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        familyId,
        tokenHash,
        expiresAt: this.calculateExpiry(),
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });

    return rawToken;
  }
}
