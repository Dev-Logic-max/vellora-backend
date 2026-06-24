-- Contract lifecycle + user-activation workflow (employee-module batch 3).
-- Additive/idempotent. Adds:
--   • contracts: status (active/cancelled) + cancel/extend/soft-delete audit cols
--   • activation_requests: approval queue for users created/registered in a
--     pending state (HR/admin approve→invite or reject→24h cooldown).
-- Plan limits count ACTIVE memberships only (enforced in code, not here).

-- ── new enum ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."activation_request_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── contracts: lifecycle columns ─────────────────────────────────────────────
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── activation_requests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "activation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "employee_id" uuid,
  "user_id" uuid,
  "membership_id" uuid,
  "email" text NOT NULL,
  "requested_role" "public"."membership_role" DEFAULT 'employee' NOT NULL,
  "status" "public"."activation_request_status" DEFAULT 'pending' NOT NULL,
  -- how the request originated: 'created' (by an upper role) or 'self_register'.
  "source" text DEFAULT 'created' NOT NULL,
  "requested_by" uuid,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "reject_reason" text,
  -- earliest a rejected applicant may re-apply (reject + 24h).
  "cooldown_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- FKs
DO $$ BEGIN
  ALTER TABLE "activation_requests" ADD CONSTRAINT "activation_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activation_requests" ADD CONSTRAINT "activation_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activation_requests" ADD CONSTRAINT "activation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activation_requests" ADD CONSTRAINT "activation_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activation_requests" ADD CONSTRAINT "activation_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- indexes
CREATE INDEX IF NOT EXISTS "activation_requests_company_id_idx" ON "activation_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_requests_status_idx" ON "activation_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activation_requests_employee_id_idx" ON "activation_requests" USING btree ("employee_id");--> statement-breakpoint
-- One pending request per email per company (re-apply allowed after a decision).
CREATE UNIQUE INDEX IF NOT EXISTS "activation_requests_one_pending_idx" ON "activation_requests" USING btree ("company_id","email") WHERE "status" = 'pending';--> statement-breakpoint

-- ── RLS (tenant isolation on company_id) ─────────────────────────────────────
ALTER TABLE "activation_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "activation_requests_tenant_isolation" ON "activation_requests" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
