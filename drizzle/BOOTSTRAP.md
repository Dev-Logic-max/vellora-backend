# Migrations — portability & fresh-database setup

The migrations in this folder are **standard PostgreSQL** (Drizzle's `postgresql`
dialect) and run on **any PostgreSQL ≥ 13** — Supabase or self-hosted. They are
sequential and idempotent in order: `0000_phase0_foundation` → `0015_…`.

## What they create
Enums → tables (every tenant table has `company_id`) → FKs → indexes → the `app`
schema + `app.current_company_id()` GUC helper → **RLS** (enable + force +
tenant-isolation policy on tenant tables; deny-all on global/platform tables).
`gen_random_uuid()` is core Postgres (≥13) — no extension needed.

## The ONE prerequisite on a non-Supabase database
The migrations `GRANT … TO authenticated` / `REVOKE … FROM anon, authenticated`.
On **Supabase** these two roles exist automatically — nothing to do.

On a **fresh non-Supabase Postgres**, create them ONCE before running migrations
(they are the NOBYPASSRLS app role + the unauthenticated role the RLS model
assumes). Run `psql -f drizzle/bootstrap-roles.sql "$DATABASE_URL"` first, then
`pnpm db:migrate`.

## Not portable to non-Postgres engines
RLS, Postgres enums, `gen_random_uuid()`, and the `app` GUC are PostgreSQL
features. The platform is Postgres-only by design (Supabase is the locked stack);
MySQL/SQLite/SQL Server are **not** targets.

## Naming
Files are `NNNN_<phase-or-purpose>.sql`, sequential, matched 1:1 to
`meta/_journal.json` tags. Drizzle tracks applied migrations by SQL **hash** (in
`drizzle.__drizzle_migrations`), not by filename — so a future rename must update
the journal tag in lockstep but never the SQL body of an applied migration
(changing the body changes the hash → drizzle re-runs it → error).
