-- ============================================================================
-- Vellora — Row-Level Security policies (PLACEHOLDER / not yet applied)
-- ============================================================================
--
-- This file documents the intended Postgres RLS model for multi-tenancy. It is
-- NOT run automatically by the app or by drizzle-kit migrations yet — it lives
-- here as the source of truth for when tenant isolation is enforced at the
-- database layer (Phase 1). Until then, isolation is enforced in the app via
-- TenantGuard + TenantInterceptor + tenant-scoped queries.
--
-- Strategy
-- --------
-- The API connects to Postgres with a single role. Per request, the
-- TenantInterceptor sets a transaction-local GUC with the authenticated user's
-- company id:
--
--     SET LOCAL app.current_company_id = '<uuid>';
--
-- RLS policies below compare each row's company_id against that GUC so a
-- request can only ever see/affect its own tenant's rows. Supabase's own
-- auth.uid()/auth.jwt() helpers can be layered in for client-direct access.
-- ============================================================================

-- Helper: read the current tenant from the session, NULL when unset.
CREATE OR REPLACE FUNCTION app.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$;

-- ── companies ───────────────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_tenant_isolation ON companies
  USING (id = app.current_company_id())
  WITH CHECK (id = app.current_company_id());

-- ── users ───────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON users
  USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

-- TODO(Phase 1): generate a drizzle migration that creates the `app` schema +
-- function above, then ENABLE/FORCE RLS and attach these policies. Add a
-- super_admin bypass policy keyed off the JWT role claim if cross-tenant
-- administration is required.
