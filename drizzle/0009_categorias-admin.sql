CREATE TYPE "public"."category_change_type" AS ENUM('created', 'updated', 'archived', 'restored', 'deleted');--> statement-breakpoint
CREATE TABLE "category_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text,
	"category_id" uuid,
	"action" "category_change_type" NOT NULL,
	"type" "transaction_type" NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_change" ADD CONSTRAINT "category_change_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_change" ADD CONSTRAINT "category_change_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_change_created_at_idx" ON "category_change" USING btree ("created_at");