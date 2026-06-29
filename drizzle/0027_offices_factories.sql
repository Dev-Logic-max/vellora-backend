-- Offices + Factories workplace modules (mirror stores) + company workplace_types.
-- Tenant-scoped + RLS on company_id. Additive / idempotent.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "workplace_types" text[] NOT NULL DEFAULT '{stores}';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "offices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "category" text,
  "status" "store_status" DEFAULT 'active' NOT NULL,
  "country" text, "state" text, "city" text, "address" text, "postal_code" text,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "head_office" boolean DEFAULT false NOT NULL,
  "logo_url" text, "banner_url" text,
  "floors" integer DEFAULT 1 NOT NULL,
  "desks" integer DEFAULT 0 NOT NULL,
  "meeting_rooms" integer DEFAULT 0 NOT NULL,
  "departments" text[] DEFAULT '{}' NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "manager_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "factories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "category" text,
  "status" "store_status" DEFAULT 'active' NOT NULL,
  "country" text, "state" text, "city" text, "address" text, "postal_code" text,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "head_factory" boolean DEFAULT false NOT NULL,
  "logo_url" text, "banner_url" text,
  "production_lines" integer DEFAULT 1 NOT NULL,
  "daily_output" integer DEFAULT 0 NOT NULL,
  "shift_model" integer DEFAULT 2 NOT NULL,
  "safety_level" text DEFAULT 'medium' NOT NULL,
  "machine_count" integer DEFAULT 0 NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "manager_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "offices" ADD CONSTRAINT "offices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "offices" ADD CONSTRAINT "offices_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "offices" ADD CONSTRAINT "offices_company_code_unique" UNIQUE ("company_id","code");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offices_company_id_idx" ON "offices" USING btree ("company_id");--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "factories" ADD CONSTRAINT "factories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "factories" ADD CONSTRAINT "factories_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "factories" ADD CONSTRAINT "factories_company_code_unique" UNIQUE ("company_id","code");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "factories_company_id_idx" ON "factories" USING btree ("company_id");--> statement-breakpoint

-- RLS (tenant isolation on company_id)
ALTER TABLE "offices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "offices_tenant_isolation" ON "offices" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "factories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "factories_tenant_isolation" ON "factories" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
