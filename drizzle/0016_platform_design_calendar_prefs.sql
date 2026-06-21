-- UI-4: extend the platform design singleton with the scheduling calendar style
-- and a misc UI-prefs map (density / motion). GLOBAL config (no company_id, no RLS).
-- Additive + idempotent. Fold into 0011_platform_design_settings.sql once applied
-- (per the migration-hygiene note in CLAUDE.md), then delete this file.

ALTER TABLE "platform_design_settings"
  ADD COLUMN IF NOT EXISTS "calendar_style" text DEFAULT 'grid' NOT NULL;
--> statement-breakpoint
ALTER TABLE "platform_design_settings"
  ADD COLUMN IF NOT EXISTS "prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;
