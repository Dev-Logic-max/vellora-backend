-- Phase 9-E — Platform admin console + hardening (roles-and-access §3).
-- users.platform_role (cross-tenant operator) + GLOBAL platform tables
-- (feature_flags, entitlement_overrides, platform_audit_log). These are NOT
-- tenant-scoped: no company_id RLS — the PlatformGuard is their access gate.

CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'platform_admin', 'operations');--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role";--> statement-breakpoint

CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_overrides_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_company_id" uuid,
	"target_user_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_audit_log_actor_idx" ON "platform_audit_log" USING btree ("actor_user_id");
-- NOTE: feature_flags / entitlement_overrides / platform_audit_log are GLOBAL
-- platform tables. No RLS — access is the PlatformGuard. The runtime privileged
-- role already owns them; no GRANT to `authenticated` (tenant users never touch
-- these directly).
