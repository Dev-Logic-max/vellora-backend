-- Company banner image + the tenant→platform request inbox.
-- Additive/idempotent. Adds: companies.banner_url, platform_requests (tenant-scoped
-- + RLS — a company sees only its own; the platform reads cross-tenant on the
-- privileged connection, same as the rest of the admin module).

-- ── companies.banner_url ─────────────────────────────────────────────────────
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "banner_url" text;--> statement-breakpoint

-- ── platform_requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "type" text NOT NULL,
  "module" text,
  "priority" text DEFAULT 'medium' NOT NULL,
  "subject" text NOT NULL,
  "message" text,
  "status" text DEFAULT 'received' NOT NULL,
  "action_status" text DEFAULT 'waiting' NOT NULL,
  "requested_by" uuid,
  "handled_by" uuid,
  "response" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform_requests" ADD CONSTRAINT "platform_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "platform_requests_company_id_idx" ON "platform_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_requests_status_idx" ON "platform_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_requests_type_idx" ON "platform_requests" USING btree ("type");--> statement-breakpoint

-- ── RLS (tenant isolation on company_id) ─────────────────────────────────────
ALTER TABLE "platform_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "platform_requests_tenant_isolation" ON "platform_requests" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
