/**
 * Typed, namespaced view over the validated environment. Injected through
 * ConfigService<AppConfig, true> so call sites get full type-safety, e.g.
 * `config.get('database.poolUrl', { infer: true })`.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  database: {
    /** Direct connection (:5432) — drizzle-kit migrations. */
    url: string;
    /** Transaction-pooler connection (:6543) — runtime queries. */
    poolUrl: string;
  };
  supabase: {
    url?: string;
    anonKey?: string;
    serviceRoleKey?: string;
    jwtSecret?: string;
    /** Private Storage bucket for documents (signed URLs only). */
    docsBucket: string;
    /** PUBLIC Storage bucket for profile images (company banner/logo, avatars). */
    publicBucket: string;
  };
  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
  redis: {
    url?: string;
  };
  email: {
    /** Resend API key — when unset, email degrades to a logged no-op. */
    apiKey?: string;
    from: string;
  };
  stripe: {
    /** Secret key — server only. When unset, billing degrades to a stub. */
    secretKey?: string;
    /** Webhook signing secret used to verify inbound events. */
    webhookSecret?: string;
  };
  /** Server-only Gemini key (Phase 9 AI). Unset → AI features stub out. */
  gemini: {
    apiKey?: string;
  };
  /** Optional Sentry DSN for error tracking (server only). */
  sentryDsn?: string;
  /** Public web app origin, used to build deep links in notifications/emails. */
  appUrl: string;
  /** Attendance terminal QR settings. */
  terminal: {
    /** Seconds a clock-in QR stays valid before it rotates. */
    qrTtlSeconds: number;
  };
}

export default (): AppConfig => {
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3030', 10),
    corsOrigins,
    database: {
      url: process.env.DATABASE_URL ?? '',
      // Fall back to the direct URL if the pooler URL is unset so local boot
      // never hard-fails on a single missing key.
      poolUrl: process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL ?? '',
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      jwtSecret: process.env.SUPABASE_JWT_SECRET,
      docsBucket: process.env.SUPABASE_DOCS_BUCKET ?? 'documents',
      publicBucket: process.env.SUPABASE_PUBLIC_BUCKET ?? 'public-assets',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    email: {
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? 'Vellora <noreply@vellora.app>',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
    },
    sentryDsn: process.env.SENTRY_DSN,
    appUrl: (corsOrigins[0] ?? 'http://localhost:3000').replace(/\/$/, ''),
    terminal: {
      qrTtlSeconds: parseInt(process.env.TERMINAL_QR_TTL_SECONDS ?? '180', 10),
    },
  };
};
