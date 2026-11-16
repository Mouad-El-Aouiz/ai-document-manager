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
  
  // Argon2
  ARGON2_MEMORY_COST: z.coerce.number().int().min(4096).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),

  // S3 / MinIO
  S3_ENDPOINT: z.string().url().default('http://minio:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('aidm_admin'),
  S3_SECRET_KEY: z.string().default('change_me_in_dev'),
  S3_BUCKET: z.string().default('aidm-documents'),
  S3_REGION: z.string().default('us-east-1'),
  S3_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  S3_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Documents (avec valeur par défaut)
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(104857600), // 100 MB
  ALLOWED_MIME_TYPES: z
    .string()
    .default('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,image/png,image/jpeg')
    .transform((val) => val.split(',')),

  // Tests
  USE_REAL_S3_IN_TESTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: unknown): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    throw new Error('Invalid environment variables');
  }
  return Object.freeze(result.data);
}

export function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch {
    process.exit(1);
  }
}