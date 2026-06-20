CREATE TYPE "public"."leave_request_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."onboarding_stage" AS ENUM('pre_start', 'first_day', 'first_week', 'first_month');--> statement-breakpoint
CREATE TYPE "public"."onboarding_assignment_status" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."transfer_kind" AS ENUM('temporary', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('requested', 'approved', 'active', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"paid" boolean DEFAULT true NOT NULL,
	"color" text DEFAULT '#4F46E5' NOT NULL,
	"requires_chain" boolean DEFAULT false NOT NULL,
	"accrual_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"carryover_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_per_year" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"days" numeric DEFAULT '0' NOT NULL,
	"reason" text,
	"status" "leave_request_status" DEFAULT 'requested' NOT NULL,
	"approver_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"entitled" numeric DEFAULT '0' NOT NULL,
	"taken" numeric DEFAULT '0' NOT NULL,
	"pending" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_balances_unique" UNIQUE("employee_id","type_id","year")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid,
	"country" text,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"store_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stage" "onboarding_stage" DEFAULT 'pre_start' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"status" "onboarding_assignment_status" DEFAULT 'pending' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"from_store_id" uuid,
	"to_store_id" uuid NOT NULL,
	"kind" "transfer_kind" DEFAULT 'temporary' NOT NULL,
	"start_date" date,
	"end_date" date,
	"reason" text,
	"status" "transfer_status" DEFAULT 'requested' NOT NULL,
	"link_id" uuid,
	"requested_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_type_id_leave_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_type_id_leave_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_groups" ADD CONSTRAINT "task_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_task_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."task_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_assignments" ADD CONSTRAINT "onboarding_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_assignments" ADD CONSTRAINT "onboarding_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_assignments" ADD CONSTRAINT "onboarding_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_assignments" ADD CONSTRAINT "onboarding_assignments_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_store_id_stores_id_fk" FOREIGN KEY ("from_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_store_id_stores_id_fk" FOREIGN KEY ("to_store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_types_company_id_idx" ON "leave_types" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "leave_requests_company_id_idx" ON "leave_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_id_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_balances_company_id_idx" ON "leave_balances" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "holidays_company_id_idx" ON "holidays" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "blackout_dates_company_id_idx" ON "blackout_dates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "task_groups_company_id_idx" ON "task_groups" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tasks_company_id_idx" ON "tasks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tasks_group_id_idx" ON "tasks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_company_id_idx" ON "onboarding_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_employee_id_idx" ON "onboarding_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "transfers_company_id_idx" ON "transfers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "transfers_employee_id_idx" ON "transfers" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "transfers_status_idx" ON "transfers" USING btree ("status");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security for Phase 5 tables (mirrors src/database/rls/policies.sql).
-- Tenant isolation by app.current_company_id().
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "leave_types","leave_requests","leave_balances","holidays","blackout_dates","task_groups","tasks","onboarding_assignments","transfers" TO authenticated;--> statement-breakpoint
ALTER TABLE "leave_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "leave_types_tenant_isolation" ON "leave_types" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "leave_requests_tenant_isolation" ON "leave_requests" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "leave_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_balances" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "leave_balances_tenant_isolation" ON "leave_balances" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "holidays_tenant_isolation" ON "holidays" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "blackout_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blackout_dates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "blackout_dates_tenant_isolation" ON "blackout_dates" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "task_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_groups_tenant_isolation" ON "task_groups" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_tenant_isolation" ON "tasks" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "onboarding_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_assignments_tenant_isolation" ON "onboarding_assignments" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transfers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transfers_tenant_isolation" ON "transfers" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
