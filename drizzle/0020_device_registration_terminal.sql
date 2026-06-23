-- Device registration subsystem + terminal hardening (points 19/20/21).
-- Additive/idempotent. Adds: device_registrations + device_registration_logs
-- (one-time unique device per employee + history), a company.settings jsonb,
-- terminal 'inactive' status + deactivation audit cols + one-terminal-per-store.

-- ── new enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."device_registration_status" AS ENUM('active', 'disabled', 'revoked');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."device_registration_action" AS ENUM('registered', 'revoked', 'disabled', 'enabled', 're_registered');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- Extend the terminal status enum with 'inactive' (super-admin freeze). The
-- column is plain text today, so no enum alter is needed for it — kept here as a
-- comment for documentation. (terminals.status is `text`.)

-- ── companies.settings ───────────────────────────────────────────────────────
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- ── terminals: deactivation audit + one-per-store ────────────────────────────
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "deactivated_by" uuid;--> statement-breakpoint
ALTER TABLE "terminals" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "terminals" ADD CONSTRAINT "terminals_deactivated_by_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- Collapse any pre-existing duplicate terminals per store (keep the oldest) so the
-- unique index can be created on existing data.
DELETE FROM "terminals" t USING "terminals" d
  WHERE t.store_id = d.store_id AND t.created_at > d.created_at;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "terminals_store_unique_idx" ON "terminals" USING btree ("store_id");--> statement-breakpoint

-- ── device_registrations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "device_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "device_token" text NOT NULL,
  "fingerprint" text,
  "label" text,
  "platform" text,
  "user_agent" text,
  "status" "public"."device_registration_status" DEFAULT 'active' NOT NULL,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_by" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "device_registration_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "registration_id" uuid,
  "action" "public"."device_registration_action" NOT NULL,
  "actor_user_id" uuid,
  "device_label" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- FKs
DO $$ BEGIN
  ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registration_logs" ADD CONSTRAINT "device_registration_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registration_logs" ADD CONSTRAINT "device_registration_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registration_logs" ADD CONSTRAINT "device_registration_logs_registration_id_device_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."device_registrations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_registration_logs" ADD CONSTRAINT "device_registration_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- indexes
CREATE INDEX IF NOT EXISTS "device_registrations_company_id_idx" ON "device_registrations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_registrations_employee_id_idx" ON "device_registrations" USING btree ("employee_id");--> statement-breakpoint
-- One ACTIVE registration per employee (revoked/disabled rows kept for history).
CREATE UNIQUE INDEX IF NOT EXISTS "device_registrations_one_active_idx" ON "device_registrations" USING btree ("company_id","employee_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_registration_logs_company_id_idx" ON "device_registration_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_registration_logs_employee_id_idx" ON "device_registration_logs" USING btree ("employee_id");--> statement-breakpoint

-- ── RLS (tenant isolation on company_id, like every tenant table) ─────────────
ALTER TABLE "device_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "device_registrations_tenant_isolation" ON "device_registrations" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "device_registration_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "device_registration_logs_tenant_isolation" ON "device_registration_logs" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
