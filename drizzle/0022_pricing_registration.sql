-- Pricing module + public company registration (company module v1.1).
-- Additive/idempotent. Adds:
--   • plans: card-presentation fields (tagline/description/highlights/popular/
--     is_active/sort_order) so the Pricing module (super-admin) can edit the
--     cards shown in registration + company-create.
--   • companies: industry category + owner contact fallbacks (phone, secondary
--     & personal email) captured at registration so the platform can reach the
--     owner if email verification fails.

-- ── plans: presentation/card fields ──────────────────────────────────────────
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "tagline" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "highlights" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "popular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- ── companies: industry + owner contact fallbacks ────────────────────────────
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_phone" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_secondary_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "owner_personal_email" text;
