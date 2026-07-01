-- POS (full suite): orders + items + payments, customers/loyalty, discounts,
-- registers + cash sessions, stock movements. Product extensions (barcode/cost/
-- taxable). Tenant-scoped + RLS on company_id (same pattern as 0025_pos_products).
-- Additive/idempotent — safe to re-run.

-- ── products: new columns ────────────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "taxable" text DEFAULT 'true' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_barcode_idx" ON "products" USING btree ("barcode");--> statement-breakpoint

-- ── pos_customers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "loyalty_points" integer DEFAULT 0 NOT NULL,
  "total_spent" numeric(14, 2) DEFAULT '0' NOT NULL,
  "order_count" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_customers" ADD CONSTRAINT "pos_customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_customers" ADD CONSTRAINT "pos_customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_customers_company_id_idx" ON "pos_customers" USING btree ("company_id");--> statement-breakpoint

-- ── pos_discounts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_discounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid,
  "name" text NOT NULL,
  "code" text,
  "kind" text DEFAULT 'percent' NOT NULL,
  "value" numeric(12, 2) DEFAULT '0' NOT NULL,
  "active" text DEFAULT 'true' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_discounts" ADD CONSTRAINT "pos_discounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_discounts" ADD CONSTRAINT "pos_discounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_discounts_company_id_idx" ON "pos_discounts" USING btree ("company_id");--> statement-breakpoint

-- ── pos_registers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_registers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_registers" ADD CONSTRAINT "pos_registers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_registers" ADD CONSTRAINT "pos_registers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_registers" ADD CONSTRAINT "pos_registers_store_name_unique" UNIQUE ("store_id","name");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_registers_store_id_idx" ON "pos_registers" USING btree ("store_id");--> statement-breakpoint

-- ── pos_register_sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_register_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "register_id" uuid NOT NULL,
  "opened_by" uuid,
  "closed_by" uuid,
  "status" text DEFAULT 'open' NOT NULL,
  "opening_cash" numeric(14, 2) DEFAULT '0' NOT NULL,
  "expected_cash" numeric(14, 2) DEFAULT '0' NOT NULL,
  "counted_cash" numeric(14, 2),
  "note" text,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "pos_register_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "pos_register_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "pos_register_sessions_register_id_pos_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."pos_registers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "pos_register_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_register_sessions" ADD CONSTRAINT "pos_register_sessions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_register_sessions_register_id_idx" ON "pos_register_sessions" USING btree ("register_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_register_sessions_store_id_idx" ON "pos_register_sessions" USING btree ("store_id");--> statement-breakpoint

-- ── pos_orders ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "order_number" text NOT NULL,
  "register_id" uuid,
  "session_id" uuid,
  "cashier_id" uuid,
  "customer_id" uuid,
  "discount_id" uuid,
  "subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
  "discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "payment_method" text DEFAULT 'cash' NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "loyalty_earned" integer DEFAULT 0 NOT NULL,
  "note" text,
  "meta" jsonb,
  "refunded_at" timestamp with time zone,
  "refunded_by" uuid,
  "refund_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_register_id_pos_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."pos_registers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_session_id_pos_register_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pos_register_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_customer_id_pos_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."pos_customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_discount_id_pos_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."pos_discounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_store_number_unique" UNIQUE ("store_id","order_number");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_store_id_idx" ON "pos_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_orders_created_at_idx" ON "pos_orders" USING btree ("created_at");--> statement-breakpoint

-- ── pos_order_items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "product_id" uuid,
  "name" text NOT NULL,
  "sku" text,
  "unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
  "line_total" numeric(14, 2) DEFAULT '0' NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_order_items_order_id_idx" ON "pos_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_order_items_product_id_idx" ON "pos_order_items" USING btree ("product_id");--> statement-breakpoint

-- ── pos_payments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "method" text DEFAULT 'cash' NOT NULL,
  "amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "tendered" numeric(14, 2),
  "change" numeric(14, 2),
  "reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_payments_order_id_idx" ON "pos_payments" USING btree ("order_id");--> statement-breakpoint

-- ── pos_stock_movements ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pos_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "delta" integer NOT NULL,
  "balance" integer NOT NULL,
  "reason" text DEFAULT 'adjust' NOT NULL,
  "order_id" uuid,
  "actor_id" uuid,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_stock_movements_product_id_idx" ON "pos_stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pos_stock_movements_store_id_idx" ON "pos_stock_movements" USING btree ("store_id");--> statement-breakpoint

-- ── RLS (tenant isolation on company_id) ─────────────────────────────────────
ALTER TABLE "pos_customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_customers_tenant_isolation" ON "pos_customers" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_discounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_discounts_tenant_isolation" ON "pos_discounts" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_registers_tenant_isolation" ON "pos_registers" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_register_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_register_sessions_tenant_isolation" ON "pos_register_sessions" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_orders_tenant_isolation" ON "pos_orders" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_order_items_tenant_isolation" ON "pos_order_items" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_payments_tenant_isolation" ON "pos_payments" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

ALTER TABLE "pos_stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "pos_stock_movements_tenant_isolation" ON "pos_stock_movements" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;
