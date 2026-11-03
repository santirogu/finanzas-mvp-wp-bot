ALTER TYPE "public"."account_event_type" ADD VALUE 'notice_published';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'notice_removed';--> statement-breakpoint
CREATE TABLE "app_notice" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"message" text NOT NULL,
	"message_en" text,
	"tone" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	CONSTRAINT "app_notice_single_row" CHECK ("app_notice"."id" = 1),
	CONSTRAINT "app_notice_tone" CHECK ("app_notice"."tone" in ('info', 'important'))
);
--> statement-breakpoint
ALTER TABLE "app_notice" ADD CONSTRAINT "app_notice_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;