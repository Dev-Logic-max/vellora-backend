-- User-model corrections: job_title split, company registration_id, platform_admins
-- + platform_signups tables, and user_* table renames. Additive / idempotent.
-- NOTE: "role" platform-wide ALWAYS means the platform/company role (on memberships);
-- the people directory's job title is `job_title`.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "job_title" text;--> statement-breakpoint
UPDATE "employees" SET "job_title" = "role" WHERE "job_title" IS NULL AND "role" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "registration_id" text;--> statement-breakpoint
UPDATE "companies" SET "registration_id" = 'REG-' || upper(substr(replace(id::text,'-',''),1,6)) WHERE "registration_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_registration_id_unique" ON "companies" ("registration_id");--> statement-breakpoint

ALTER TABLE IF EXISTS "employee_bank_accounts" RENAME TO "user_bank_accounts";--> statement-breakpoint
ALTER TABLE IF EXISTS "emp_preferences" RENAME TO "user_preferences";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_admins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supabase_uid" uuid NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "platform_role" text NOT NULL DEFAULT 'operations',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_supabase_uid_unique" ON "platform_admins" ("supabase_uid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_unique" ON "platform_admins" ("email");--> statement-breakpoint
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN CREATE POLICY "platform_admins_deny_all" ON "platform_admins" USING (false) WITH CHECK (false); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "company_registration_id" text,
  "supabase_uid" uuid,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_signups_email_idx" ON "platform_signups" ("email");--> statement-breakpoint
ALTER TABLE "platform_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN CREATE POLICY "platform_signups_deny_all" ON "platform_signups" USING (false) WITH CHECK (false); EXCEPTION WHEN duplicate_object THEN null; END $$;
