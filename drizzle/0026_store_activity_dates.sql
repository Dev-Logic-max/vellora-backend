-- Date-specific store activities (point 5): activity types mapped to a store for a
-- specific month / date range, surfaced as colored blocks on matching store+date shifts.
-- Additive / idempotent — extends the existing store_activities table.

ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "type" text;--> statement-breakpoint
ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "icon" text;--> statement-breakpoint
ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "start_date" text;--> statement-breakpoint
ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "end_date" text;--> statement-breakpoint
ALTER TABLE "store_activities" ADD COLUMN IF NOT EXISTS "month" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "store_activities_month_idx" ON "store_activities" USING btree ("store_id","month");
