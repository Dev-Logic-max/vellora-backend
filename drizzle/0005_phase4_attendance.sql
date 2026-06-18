CREATE TYPE "public"."anomaly_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."anomaly_status" AS ENUM('open', 'in_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."anomaly_type" AS ENUM('late', 'early_leave', 'missing_punch', 'no_show', 'over_hours', 'location_mismatch');--> statement-breakpoint
CREATE TYPE "public"."attendance_log_status" AS ENUM('open', 'closed', 'flagged', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."attendance_method" AS ENUM('qr', 'manual', 'terminal');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('online', 'offline_sync');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('pending', 'registered', 'reset', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."terminal_status" AS ENUM('pending', 'active', 'blocked');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"label" text NOT NULL,
	"platform" text,
	"status" "device_status" DEFAULT 'pending' NOT NULL,
	"bound_hint" text,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"log_id" uuid,
	"type" "anomaly_type" NOT NULL,
	"severity" "anomaly_severity" DEFAULT 'medium' NOT NULL,
	"status" "anomaly_status" DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"log_id" uuid NOT NULL,
	"start_utc" timestamp with time zone NOT NULL,
	"end_utc" timestamp with time zone,
	"minutes" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid,
	"clock_in_utc" timestamp with time zone NOT NULL,
	"clock_out_utc" timestamp with time zone,
	"method" "attendance_method" DEFAULT 'manual' NOT NULL,
	"device_id" uuid,
	"terminal_id" uuid,
	"lat" double precision,
	"lng" double precision,
	"source" "attendance_source" DEFAULT 'online' NOT NULL,
	"status" "attendance_log_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"log_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"requested_by" uuid,
	"approved_by" uuid,
	"status" "correction_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "terminals" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "terminals" ADD COLUMN "qr_secret" text;--> statement-breakpoint
ALTER TABLE "terminals" ADD COLUMN "qr_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "terminals" ADD COLUMN "last_seen" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_log_id_attendance_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_log_id_attendance_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_terminal_id_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."terminals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_log_id_attendance_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_company_id_idx" ON "devices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "devices_employee_id_idx" ON "devices" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "anomalies_company_id_idx" ON "anomalies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "anomalies_store_id_idx" ON "anomalies" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "anomalies_status_idx" ON "anomalies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "attendance_breaks_log_id_idx" ON "attendance_breaks" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "attendance_logs_company_id_idx" ON "attendance_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "attendance_logs_store_id_idx" ON "attendance_logs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "attendance_logs_employee_id_idx" ON "attendance_logs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_logs_clock_in_idx" ON "attendance_logs" USING btree ("clock_in_utc");--> statement-breakpoint
CREATE INDEX "corrections_company_id_idx" ON "corrections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "corrections_log_id_idx" ON "corrections" USING btree ("log_id");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security for Phase 4 tables (mirrors src/database/rls/policies.sql).
-- Tenant isolation by app.current_company_id(). (terminals already secured in 0001.)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "attendance_logs","attendance_breaks","anomalies","corrections","devices" TO authenticated;--> statement-breakpoint
ALTER TABLE "attendance_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_logs_tenant_isolation" ON "attendance_logs" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "attendance_breaks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_breaks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attendance_breaks_tenant_isolation" ON "attendance_breaks" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "anomalies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "anomalies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "anomalies_tenant_isolation" ON "anomalies" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "corrections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "corrections_tenant_isolation" ON "corrections" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "devices_tenant_isolation" ON "devices" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());