-- Run ONCE on a fresh NON-Supabase PostgreSQL database, before `pnpm db:migrate`.
-- Supabase creates these roles automatically; vanilla Postgres does not, and the
-- migrations GRANT/REVOKE against them. Idempotent — safe to re-run.
--
--   psql -f drizzle/bootstrap-roles.sql "$DATABASE_URL"

DO $$
BEGIN
  -- The app's RLS-enforced runtime role (NOBYPASSRLS). Tenant queries do
  -- `SET LOCAL ROLE authenticated` so Postgres RLS filters by company.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
  END IF;

  -- The unauthenticated role the RLS model denies by default.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOBYPASSRLS;
  END IF;

  -- Let the connection's runtime user assume `authenticated` (SET ROLE).
  EXECUTE format('GRANT authenticated TO %I', current_user);
END
$$;
