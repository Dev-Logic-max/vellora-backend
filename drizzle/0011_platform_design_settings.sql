-- Platform design settings (design module) — GLOBAL config (no company_id, no RLS).
-- Singleton row holds the active theme key + sparse semantic-token overrides
-- applied platform-wide on top of the Aurora defaults. See design-theme-system.md.

CREATE TABLE "platform_design_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text DEFAULT 'default' NOT NULL,
	"theme_key" text DEFAULT 'aurora' NOT NULL,
	"tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_design_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint

-- Seed the singleton (pure Aurora; empty override map).
INSERT INTO "platform_design_settings" ("key", "theme_key", "tokens")
VALUES ('default', 'aurora', '{}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
