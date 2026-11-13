import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  CORS_ORIGINS: z.string().transform((val) => val.split(',').map((o) => o.trim())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Ajouter dans envSchema
  ARGON2_MEMORY_COST: z.coerce.number().int().min(4096).default(19456), // 19 MiB
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: unknown): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    throw new Error('Invalid environment variables'); // On throw au lieu de process.exit
  }
  return Object.freeze(result.data);
}

// Fonction à appeler dans server.ts
export function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch {
    process.exit(1);
  }
}
