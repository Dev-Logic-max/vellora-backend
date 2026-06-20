CREATE TYPE "public"."doc_folder_kind" AS ENUM('company', 'employee');--> statement-breakpoint
CREATE TYPE "public"."document_visibility" AS ENUM('company', 'role', 'employee');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('active', 'expiring', 'expired', 'trashed');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('requested', 'signed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."notif_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."digest_freq" AS ENUM('off', 'daily', 'weekly');--> statement-breakpoint
CREATE TABLE "doc_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" "doc_folder_kind" DEFAULT 'company' NOT NULL,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"category" text,
	"storage_key" text NOT NULL,
	"mime" text,
	"size" bigint,
	"visibility" "document_visibility" DEFAULT 'company' NOT NULL,
	"employee_id" uuid,
	"owner_id" uuid,
	"expires_at" timestamp with time zone,
	"status" "document_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"status" "signature_status" DEFAULT 'requested' NOT NULL,
	"signed_storage_key" text,
	"signed_at" timestamp with time zone,
	"audit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_trash" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_key" text NOT NULL,
	"deleted_by" uuid,
	"purge_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"priority" "notif_priority" DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"channel_sent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notif_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"digest" "digest_freq" DEFAULT 'off' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notif_preferences_user_category_unique" UNIQUE("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "notif_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body_template" text NOT NULL,
	"default_priority" "notif_priority" DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notif_templates_category_type_unique" UNIQUE("category","type")
);
--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_folders" ADD CONSTRAINT "doc_folders_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_doc_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_trash" ADD CONSTRAINT "doc_trash_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_trash" ADD CONSTRAINT "doc_trash_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notif_preferences" ADD CONSTRAINT "notif_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notif_preferences" ADD CONSTRAINT "notif_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_folders_company_id_idx" ON "doc_folders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "doc_folders_parent_id_idx" ON "doc_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "documents_company_id_idx" ON "documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "documents_folder_id_idx" ON "documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_expires_at_idx" ON "documents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signatures_company_id_idx" ON "signatures" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "signatures_document_id_idx" ON "signatures" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_trash_company_id_idx" ON "doc_trash" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_company_id_idx" ON "notifications" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_at_idx" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "notif_preferences_company_id_idx" ON "notif_preferences" USING btree ("company_id");--> statement-breakpoint
-- ── RLS: enable + force + tenant-isolation policy on every new tenant table ──
-- (notif_templates is GLOBAL reference data → reached only via the privileged
--  connection; RLS enabled with no policy = deny-all for non-bypass roles.)
GRANT SELECT, INSERT, UPDATE, DELETE ON "doc_folders","documents","signatures","doc_trash","notifications","notif_preferences" TO authenticated;--> statement-breakpoint
ALTER TABLE "doc_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_folders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "doc_folders_tenant_isolation" ON "doc_folders" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signatures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "signatures_tenant_isolation" ON "signatures" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "doc_trash" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_trash" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "doc_trash_tenant_isolation" ON "doc_trash" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "notif_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notif_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notif_preferences_tenant_isolation" ON "notif_preferences" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "notif_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notif_templates" FORCE ROW LEVEL SECURITY;
