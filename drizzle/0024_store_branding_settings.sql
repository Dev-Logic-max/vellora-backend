-- Store branding (logo + banner) + per-store settings jsonb.
-- Additive/idempotent — store detail page banner/logo upload + configuration.

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "logo_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "banner_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
