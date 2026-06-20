-- Phase 9-C — Reports & Analytics (16-reports).
-- report_defs (saved definitions) + report_runs (executions). Both tenant-owned
-- (company_id + RLS). Aggregates read existing module data; only these two
-- tables are new.

CREATE TYPE "public"."report_run_status" AS ENUM('queued', 'running', 'ready', 'failed');--> statement-breakpoint

CREATE TABLE "report_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule" text,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_def_id" uuid NOT NULL,
	"status" "report_run_status" DEFAULT 'queued' NOT NULL,
	"output_key" text,
	"format" text DEFAULT 'csv' NOT NULL,
	"error" text,
	"ran_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_defs" ADD CONSTRAINT "report_defs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_def_id_report_defs_id_fk" FOREIGN KEY ("report_def_id") REFERENCES "public"."report_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_defs_company_id_idx" ON "report_defs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "report_runs_company_id_idx" ON "report_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "report_runs_report_def_id_idx" ON "report_runs" USING btree ("report_def_id");--> statement-breakpoint
-- ── RLS: enable + force + tenant-isolation on the new tenant tables ──────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "report_defs","report_runs" TO authenticated;--> statement-breakpoint
ALTER TABLE "report_defs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_defs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "report_defs_tenant_isolation" ON "report_defs" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "report_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "report_runs_tenant_isolation" ON "report_runs" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
