import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PENDING_UPLOAD_TTL_HOURS: z.coerce.number().int().positive().default(24),
  SOFT_DELETE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_FREE_VERSIONS: z.coerce.number().int().positive().default(3),
  RETENTION_PRO_VERSIONS: z.coerce.number().int().positive().default(10),
  RETENTION_ENTERPRISE_VERSIONS: z.coerce.number().int().positive().default(50),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid worker env:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return Object.freeze(result.data);
}
