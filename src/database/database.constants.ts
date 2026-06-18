/** DI token for the Drizzle database instance (schema-aware). */
export const DRIZZLE = Symbol('DRIZZLE_ORM');

/** DI token for the raw postgres.js client (used for shutdown + health pings). */
export const PG_CONNECTION = Symbol('PG_CONNECTION');

/**
 * Built-in Supabase role (NOBYPASSRLS) assumed per-request via `SET LOCAL ROLE`
 * so Row-Level Security is enforced on tenant-scoped queries. We deliberately
 * reuse `authenticated` rather than a custom role: Supabase's transaction pooler
 * (Supavisor) drops the connection when a session grants a role to its own login
 * role, which makes a custom-role membership ungrantable over the pooler.
 * `postgres` can already SET ROLE into `authenticated`. See rls/policies.sql.
 */
export const APP_DB_ROLE = 'authenticated';

/** Session GUC that RLS policies read to scope rows to the active tenant. */
export const TENANT_GUC = 'app.current_company_id';
