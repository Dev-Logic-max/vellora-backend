-- Phase 8 — Billing & Subscriptions (15-billing).
-- Enriches the existing global `plans` + `subscriptions` stubs and adds the
-- tenant-owned `usage`, `invoices`, `discounts` tables. `plans` stays GLOBAL
-- (no company_id, no RLS); the three new tenant tables get company_id + RLS.

CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void');--> statement-breakpoint

-- ── new global columns on plans ──────────────────────────────────────────────
ALTER TABLE "plans" ADD COLUMN "tier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_month" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_year" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "stripe_price_ids" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- ── subscriptions: enum-ize status + Stripe/billing fields ───────────────────
ALTER TABLE "subscriptions" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."subscription_status" USING "status"::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'trialing'::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "interval" text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at" timestamp with time zone;--> statement-breakpoint

-- ── new tenant tables ────────────────────────────────────────────────────────
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_company_metric_unique" UNIQUE("company_id","metric")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"number" text,
	"amount" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"hosted_url" text,
	"pdf_url" text,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_stripe_invoice_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"pct" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_company_id_idx" ON "usage" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoices_company_id_idx" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "discounts_company_id_idx" ON "discounts" USING btree ("company_id");--> statement-breakpoint
-- ── RLS: enable + force + tenant-isolation on the new tenant tables ──────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "usage","invoices","discounts" TO authenticated;--> statement-breakpoint
ALTER TABLE "usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_tenant_isolation" ON "usage" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "discounts_tenant_isolation" ON "discounts" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
