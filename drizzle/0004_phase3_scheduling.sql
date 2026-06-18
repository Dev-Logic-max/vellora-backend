CREATE TABLE "coverage_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"hour" integer NOT NULL,
	"required_staff" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coverage_targets_unique" UNIQUE("store_id","weekday","hour")
);
--> statement-breakpoint
CREATE TABLE "shift_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"starts_at_utc" timestamp with time zone NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"paid" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid,
	"name" text NOT NULL,
	"pattern" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"employee_id" uuid,
	"activity_id" uuid,
	"role" text,
	"starts_at_utc" timestamp with time zone NOT NULL,
	"ends_at_utc" timestamp with time zone NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"status" "shift_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"source" "shift_source" DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coverage_targets" ADD CONSTRAINT "coverage_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_targets" ADD CONSTRAINT "coverage_targets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_activity_id_store_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."store_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coverage_targets_store_id_idx" ON "coverage_targets" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "shift_breaks_shift_id_idx" ON "shift_breaks" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_templates_company_id_idx" ON "shift_templates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shifts_company_id_idx" ON "shifts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shifts_store_id_idx" ON "shifts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "shifts_employee_id_idx" ON "shifts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "shifts_starts_at_idx" ON "shifts" USING btree ("starts_at_utc");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security for Phase 3 tables (mirrors src/database/rls/policies.sql).
-- Tenant isolation by app.current_company_id().
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "shifts","shift_templates","shift_breaks","coverage_targets" TO authenticated;--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shifts_tenant_isolation" ON "shifts" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "shift_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shift_templates_tenant_isolation" ON "shift_templates" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "shift_breaks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_breaks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "shift_breaks_tenant_isolation" ON "shift_breaks" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "coverage_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coverage_targets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "coverage_targets_tenant_isolation" ON "coverage_targets" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());