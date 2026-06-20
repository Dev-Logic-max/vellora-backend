-- Harden the GLOBAL platform tables against PostgREST exposure.
-- These tables are reached ONLY by the backend's privileged connection (which
-- bypasses RLS). They sit in the `public` schema, so Supabase's auto-API could
-- otherwise expose them to the anon/authenticated roles. Enabling RLS with NO
-- policy = deny-all to those roles (same posture as `plans`/`users`/`groups`),
-- while the privileged role keeps full access. Closes the Supabase security
-- advisor `rls_disabled_in_public` errors.

ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_design_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Belt-and-braces: ensure the anon/authenticated roles hold no direct grants
-- on these platform tables (the backend never touches them as `authenticated`).
REVOKE ALL ON "feature_flags" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "entitlement_overrides" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "platform_audit_log" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "platform_design_settings" FROM anon, authenticated;
