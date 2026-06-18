CREATE TYPE "public"."contract_type" AS ENUM('full_time', 'part_time', 'temporary', 'contractor', 'intern');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('valid', 'expiring', 'expired');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('invited', 'active', 'on_leave', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."employee_store_relation" AS ENUM('secondary', 'guest', 'peak');--> statement-breakpoint
CREATE TYPE "public"."shift_source" AS ENUM('manual', 'template', 'suggested');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('draft', 'assigned', 'published', 'approved', 'cancelled', 'off');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "contract_type" DEFAULT 'full_time' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"hours_week" integer,
	"salary" numeric,
	"currency" text DEFAULT 'USD' NOT NULL,
	"doc_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emp_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notif_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ui_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emp_preferences_employee_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"primary_store_id" uuid,
	"user_id" uuid,
	"unique_code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"department" text,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"hire_date" date,
	"contract_type" "contract_type",
	"avatar_url" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_company_code_unique" UNIQUE("company_id","unique_code")
);
--> statement-breakpoint
CREATE TABLE "medicals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"date" date,
	"expires" date,
	"status" "credential_status" DEFAULT 'valid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"issued" date,
	"expires" date,
	"doc_id" uuid,
	"status" "credential_status" DEFAULT 'valid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_stores" ADD COLUMN "employee_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_stores" ADD COLUMN "relation" "employee_store_relation" DEFAULT 'secondary' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_stores" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emp_preferences" ADD CONSTRAINT "emp_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emp_preferences" ADD CONSTRAINT "emp_preferences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_primary_store_id_stores_id_fk" FOREIGN KEY ("primary_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicals" ADD CONSTRAINT "medicals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicals" ADD CONSTRAINT "medicals_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_employee_id_idx" ON "contracts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employees_company_id_idx" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employees_primary_store_id_idx" ON "employees" USING btree ("primary_store_id");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "medicals_employee_id_idx" ON "medicals" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "qualifications_employee_id_idx" ON "qualifications" USING btree ("employee_id");--> statement-breakpoint
ALTER TABLE "employee_stores" ADD CONSTRAINT "employee_stores_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_stores_company_id_idx" ON "employee_stores" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_stores_employee_id_idx" ON "employee_stores" USING btree ("employee_id");--> statement-breakpoint
ALTER TABLE "employee_stores" ADD CONSTRAINT "employee_stores_employee_store_unique" UNIQUE("employee_id","store_id");--> statement-breakpoint
-- ============================================================================
-- Row-Level Security for Phase 2 tables (mirrors src/database/rls/policies.sql).
-- Tenant isolation by app.current_company_id(). employee_stores already had RLS
-- enabled in 0001; only the new tables need policies here.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "employees","contracts","qualifications","medicals","emp_preferences" TO authenticated;--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "employees_tenant_isolation" ON "employees" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contracts_tenant_isolation" ON "contracts" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "qualifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qualifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "qualifications_tenant_isolation" ON "qualifications" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "medicals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "medicals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "medicals_tenant_isolation" ON "medicals" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "emp_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "emp_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "emp_preferences_tenant_isolation" ON "emp_preferences" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());