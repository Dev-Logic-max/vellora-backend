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
  };
  cloudinary: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
  };
  redis: {
    url?: string;
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
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
  };
};
