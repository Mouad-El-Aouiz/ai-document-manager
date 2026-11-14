import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { AuditService } from './audit.service.js';
import { authLookupUser } from '../db/auth-lookup.js';
import { AppError } from '../errors/AppError.js';
import type { Logger } from 'pino';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

export class AuthService {
  private readonly passwordService: PasswordService;
  private readonly tokenService: TokenService;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly auditService: AuditService;

  constructor(
    private readonly prisma: PrismaClient,
    env: Env,
    logger: Logger,
  ) {
    this.passwordService = new PasswordService(env);
    this.tokenService = new TokenService(env);
    this.refreshTokenService = new RefreshTokenService(prisma, env);
    this.auditService = new AuditService(prisma, logger);
  }

  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const user = await authLookupUser(this.prisma, email);

    if (!user) {
      await this.passwordService.verifyDummy();
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid credentials');
    }

    const isValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      await this.auditService.log('LOGIN_FAILURE', user.organizationId, user.id, {
        reason: 'INVALID_PASSWORD',
        ip,
      });
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid credentials');
    }

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      org: user.organizationId,
      role: user.role as 'ADMIN' | 'EDITOR' | 'VIEWER',
    });

    const fullUser = {
      id: user.id,
      organizationId: user.organizationId,
      email,
      passwordHash: user.passwordHash,
      role: user.role as 'ADMIN' | 'EDITOR' | 'VIEWER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const refreshToken = await this.refreshTokenService.issueInitialToken(fullUser, ip, userAgent);

    await this.auditService.log('LOGIN_SUCCESS', user.organizationId, user.id, { ip });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: email, role: user.role },
    };
  }

  async refresh(
    rawRefreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const result = await this.refreshTokenService.rotateToken(rawRefreshToken, ip, userAgent);

    const accessToken = await this.tokenService.signAccessToken({
      sub: result.user.id,
      org: result.user.organizationId,
      role: result.user.role,
    });

    return { accessToken, refreshToken: result.refreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokenService.revokeToken(rawRefreshToken);
  }

  async me(
    userId: string,
    organizationId: string,
  ): Promise<{ id: string; email: string; role: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
