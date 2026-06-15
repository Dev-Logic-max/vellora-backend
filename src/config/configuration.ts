/**
 * Typed, namespaced view over the validated environment. Injected through
 * ConfigService<AppConfig, true> so call sites get full type-safety, e.g.
 * `config.get('database.url', { infer: true })`.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  database: {
    url: string;
  };
  supabase: {
    url?: string;
    anonKey?: string;
    serviceRoleKey?: string;
    jwtSecret?: string;
  };
}

export default (): AppConfig => {
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    corsOrigins,
    database: {
      url: process.env.DATABASE_URL ?? '',
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      jwtSecret: process.env.SUPABASE_JWT_SECRET,
    },
  };
};
