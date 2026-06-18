-- ============================================================================
-- Vellora — Row-Level Security model (REFERENCE)
-- ============================================================================
--
-- This file documents the RLS model. The authoritative copy of this SQL is
-- emitted INTO the first drizzle migration (drizzle/0000_*.sql) and applied by
-- `pnpm db:migrate`. Keep the two in sync when the model changes.
--
-- Strategy
-- --------
-- The API connects with Supabase's `postgres` role, which BYPASSES RLS. That
-- connection is used ONLY for cross-tenant work (auth resolution, signup
-- provisioning, health). For ordinary tenant-scoped queries,
-- DatabaseService.withTenant opens a transaction and:
--
--     SET LOCAL ROLE authenticated;                          -- NOBYPASSRLS
--     SELECT set_config('app.current_company_id', $1, true); -- tx-local GUC
--
-- so Postgres enforces isolation regardless of any app-layer bug. SET LOCAL is
-- transaction-scoped, safe with the Supabase transaction pooler (:6543), and
-- never leaks across pooled requests.
--
-- Why `authenticated` and not a custom role? Supabase's Supavisor pooler drops
-- the connection when a session grants a role to its own login role, so the
-- membership a custom role would need (`GRANT role TO postgres WITH SET TRUE`)
-- cannot be applied over the pooler. `postgres` can already SET ROLE into the
-- built-in `authenticated` role. Our policies key off our own
-- `app.current_company_id` GUC — NOT Supabase's auth.uid() — which the backend
-- sets per request.
--
-- Every table in `public` has RLS ENABLED so that nothing is reachable through
-- Supabase's anon/authenticated auto-generated REST API without matching a
-- policy (and Supabase default-grants those roles full table privileges).
-- ============================================================================

-- app schema + tenant accessor (NULL when the GUC is unset).
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON FUNCTION app.current_company_id() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON companies, memberships TO authenticated;

-- ── companies ───────────────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = app.current_company_id())
  WITH CHECK (id = app.current_company_id());

-- ── memberships ──────────────────────────────────────────────────────────────
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

-- ── users ─────────────────────────────────────────────────────────────────────
-- GLOBAL identity table, reached only via the privileged (BYPASSRLS) connection.
-- RLS ENABLED with NO permissive policy → deny-all for every non-bypass role.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- TODO(Phase 1): ALTER DEFAULT PRIVILEGES + grants for new tenant tables; add a
-- platform super-admin path if cross-tenant administration is required.
