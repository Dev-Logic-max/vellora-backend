CREATE TABLE "employee_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"label" text,
	"country" text,
	"bank_name" text NOT NULL,
	"bank_swift" text,
	"bank_brand_color" text,
	"account_holder" text,
	"iban" text,
	"account_number" text,
	"currency" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"swift" text,
	"website" text,
	"brand_color" text,
	"logo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ref_currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer DEFAULT 2 NOT NULL,
	"country_code" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "marital_status" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "id_card_number" text;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_bank_accounts_company_id_idx" ON "employee_bank_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_bank_accounts_employee_id_idx" ON "employee_bank_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ref_banks_country_idx" ON "ref_banks" USING btree ("country_code");--> statement-breakpoint
-- Tenant isolation for the bank-accounts table (RLS on company_id, like the
-- other employee sub-tables). Privileged connection bypasses; PostgREST is scoped.
ALTER TABLE "employee_bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "employee_bank_accounts_tenant_isolation" ON "employee_bank_accounts" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
-- Global reference catalogs: deny-all to PostgREST (privileged conn bypasses);
-- closes the rls_disabled_in_public advisory for public tables.
ALTER TABLE "ref_currencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ref_banks" ENABLE ROW LEVEL SECURITY;