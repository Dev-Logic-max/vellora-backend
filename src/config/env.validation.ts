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

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Stripe (Phase 8) — server-only. Optional so the app boots without billing.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Gemini (Phase 9 AI) — server-only.
  GEMINI_API_KEY: z.string().optional(),

  // Sentry (Phase 9 hardening) — server-only.
  SENTRY_DSN: z.string().optional(),

  // Attendance terminal — seconds a clock-in QR stays valid before it rotates.
  // The kiosk auto-regenerates a few seconds before this elapses.
  TERMINAL_QR_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(180),
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
