CREATE TYPE "public"."company_status" AS ENUM('pending', 'active', 'inactive', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'hr', 'area_manager', 'store_manager', 'employee');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'invited', 'suspended', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('group', 'company', 'area', 'store', 'self');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "company_status" DEFAULT 'active' NOT NULL,
	"plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supabase_uid" uuid NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"avatar_url" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_supabase_uid_unique" UNIQUE("supabase_uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'employee' NOT NULL,
	"scope_type" "scope_type" DEFAULT 'company' NOT NULL,
	"scope_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_company_unique" UNIQUE("user_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_company_id_idx" ON "memberships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security (hand-authored — mirrors src/database/rls/policies.sql)
-- Strategy: the privileged runtime role (Supabase `postgres`, BYPASSRLS) is used
-- only for cross-tenant work (auth resolution, signup provisioning, health). For
-- tenant-scoped queries the runtime does `SET LOCAL ROLE authenticated` (a
-- built-in NOBYPASSRLS role) + a tx-local GUC, so Postgres enforces isolation.
-- Policies key off our `app.current_company_id` GUC (NOT Supabase auth.uid),
-- which the backend sets per request. RLS is enabled on EVERY public table so
-- nothing is reachable through Supabase's anon/authenticated auto-API.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS "app";--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid;
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA "app" TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_company_id() TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "companies", "memberships" TO authenticated;--> statement-breakpoint
-- companies: a tenant sees only its own row.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "companies_tenant_isolation" ON "companies"
  USING ("id" = app.current_company_id())
  WITH CHECK ("id" = app.current_company_id());--> statement-breakpoint
-- memberships: scoped to the active tenant.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_tenant_isolation" ON "memberships"
  USING ("company_id" = app.current_company_id())
  WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
-- users: GLOBAL identity table, reached only via the privileged (BYPASSRLS)
-- connection. RLS is ENABLED with NO permissive policy, so it is deny-all for
-- every non-bypass role (incl. Supabase's anon/authenticated auto-API).
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;