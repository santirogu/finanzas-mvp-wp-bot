CREATE TABLE "notification_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"upcoming_enabled" boolean DEFAULT true NOT NULL,
	"upcoming_days" smallint DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_setting_upcoming_days" CHECK ("notification_setting"."upcoming_days" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;