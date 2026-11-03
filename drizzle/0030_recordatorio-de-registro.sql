CREATE TABLE "reminder_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"days" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_setting_days" CHECK ("reminder_setting"."days" between 1 and 14)
);
--> statement-breakpoint
ALTER TABLE "reminder_setting" ADD CONSTRAINT "reminder_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;