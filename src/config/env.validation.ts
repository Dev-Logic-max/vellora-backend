import { z } from 'zod';

/**
 * Zod-validated process environment. Validated once at boot (via ConfigModule's
 * `validate`) so the app fails fast with a readable message instead of crashing
 * on first use. Optional keys (Cloudinary, Redis, Supabase) may be filled in
 * later without blocking local boot.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3030),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Direct (session-pooler :5432) connection — used by drizzle-kit migrations.
  DATABASE_URL: z.string().min(1),
  // Transaction-pooler (:6543) connection — used by the runtime Drizzle client.
  DATABASE_POOL_URL: z.string().min(1),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  REDIS_URL: z.string().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }
  return parsed.data;
}
