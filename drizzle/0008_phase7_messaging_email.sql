CREATE TYPE "public"."conversation_kind" AS ENUM('dm', 'channel');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('draft', 'queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "conversation_kind" DEFAULT 'dm' NOT NULL,
	"name" text,
	"store_id" uuid,
	"created_by" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_members_unique" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"ref" jsonb,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reads_conversation_user_unique" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"from_addr" text NOT NULL,
	"to_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_company_id_idx" ON "conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "conversation_members_company_id_idx" ON "conversation_members" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_company_id_idx" ON "messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "email_threads_company_id_idx" ON "email_threads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "email_messages_company_id_idx" ON "email_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "email_messages_thread_id_idx" ON "email_messages" USING btree ("thread_id");--> statement-breakpoint
-- ── RLS: enable + force + tenant-isolation policy on every new tenant table ──
GRANT SELECT, INSERT, UPDATE, DELETE ON "conversations","conversation_members","messages","reads","email_threads","email_messages" TO authenticated;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversations_tenant_isolation" ON "conversations" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversation_members_tenant_isolation" ON "conversation_members" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reads_tenant_isolation" ON "reads" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "email_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_threads_tenant_isolation" ON "email_threads" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());--> statement-breakpoint
ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "email_messages_tenant_isolation" ON "email_messages" USING ("company_id" = app.current_company_id()) WITH CHECK ("company_id" = app.current_company_id());
