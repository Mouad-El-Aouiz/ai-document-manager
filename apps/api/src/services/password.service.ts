import argon2 from 'argon2';
import type { Env } from '../config/env.js';

export class PasswordService {
  private readonly options: argon2.Options;

  // Hash factice utilisé pour simuler la vérification quand l'utilisateur n'existe pas
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0Zm9yZGVmZW5zZQ$y7V5Gq2HqX7Z9vB5G6vD8A0f1E2c3D4b5A6f7E8d9C0=';

  constructor(env: Env) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    };
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Simule une vérification pour égaliser le temps de réponse (anti-énumération).
   * À appeler dans le flux de login quand l'utilisateur n'existe pas.
   */
  async verifyDummy(): Promise<void> {
    try {
      await argon2.verify(PasswordService.DUMMY_HASH, 'dummy-password');
    } catch {
      // On ignore l'erreur, le but est juste de consommer du temps CPU
    }
  }
}
