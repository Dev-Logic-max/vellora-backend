ALTER TABLE "employee_stores" DROP CONSTRAINT "employee_stores_user_store_unique";--> statement-breakpoint
ALTER TABLE "employee_stores" DROP CONSTRAINT "employee_stores_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "employee_stores" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "employee_stores" DROP COLUMN "is_primary";