-- Phase 9-A — Recruiting / ATS (09-recruiting).
-- companies.slug (public careers URLs) + jobs/candidates/interviews tenant tables
-- (company_id + RLS). Resume files live in private storage (signed URLs only).

CREATE TYPE "public"."job_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."candidate_stage" AS ENUM('applied', 'review', 'interview', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."interview_mode" AS ENUM('onsite', 'phone', 'video');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'done', 'cancelled');--> statement-breakpoint

ALTER TABLE "companies" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_slug_unique" UNIQUE("slug");--> statement-breakpoint

CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"location" text,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"screener_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_company_slug_unique" UNIQUE("company_id","slug")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"resume_key" text,
	"parsed" jsonb,
	"score" integer,
	"stage" "candidate_stage" DEFAULT 'applied' NOT NULL,
	"source" text DEFAULT 'careers' NOT NULL,
	"notes" text,
	"answers" jsonb DEFAULT '{}'::jsonb,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_mins" integer DEFAULT 30 NOT NULL,
	"mode" "interview_mode" DEFAULT 'video' NOT NULL,
	"location" text,
	"interviewers" jsonb DEFAULT '[]'::jsonb,
	"ics_uid" text NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidates_company_id_idx" ON "candidates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "candidates_job_id_idx" ON "candidates" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "candidates_stage_idx" ON "candidates" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "interviews_company_id_idx" ON "interviews" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "interviews_candidate_id_idx" ON "interviews" USING btree ("candidate_id");--> statement-breakpoint
-- ── RLS: enable + force + tenant-isolation on the new tenant tables ──────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "jobs","candidates","interviews" TO authenticated;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "jobs_tenant_isolation" ON "jobs" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "candidates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "candidates_tenant_isolation" ON "candidates" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "interviews_tenant_isolation" ON "interviews" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
