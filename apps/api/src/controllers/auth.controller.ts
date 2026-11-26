import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { Env } from '../config/env.js';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const cookieOptions = (env: Env) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly env: Env,
  ) { }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = loginSchema.parse(req.body);
    const result = await this.authService.login(email, password, req.ip, req.get('user-agent'));

    res.cookie('refresh_token', result.refreshToken, cookieOptions(this.env));
    res.status(200).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken: unknown = req.cookies.refresh_token;
    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing refresh token' } });
      return;
    }

    const result = await this.authService.refresh(rawToken, req.ip, req.get('user-agent'));
    res.cookie('refresh_token', result.refreshToken, cookieOptions(this.env));
    res.status(200).json({ accessToken: result.accessToken });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken: unknown = req.cookies.refresh_token;
    if (typeof rawToken === 'string' && rawToken.length > 0) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    res.status(204).send();
  }

  // ── NOUVEAU : Récupérer le profil de l'utilisateur connecté ──
  async me(req: Request, res: Response): Promise<void> {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    // req.auth est rempli par le middleware authenticate (sub = userId, org = orgId)
    const user = await this.authService.me(req.auth.sub, req.auth.org);
    res.status(200).json({ user });
  }
}