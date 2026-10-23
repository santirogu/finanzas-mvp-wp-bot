ALTER TYPE "public"."account_event_type" ADD VALUE 'signup_mode_changed';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'signup_invite_added';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'signup_invite_removed';--> statement-breakpoint
CREATE TABLE "app_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"signup_mode" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "app_setting_single_row" CHECK ("app_setting"."id" = 1),
	CONSTRAINT "app_setting_signup_mode" CHECK ("app_setting"."signup_mode" in ('open', 'closed', 'invite'))
);
--> statement-breakpoint
CREATE TABLE "signup_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signup_invite" ADD CONSTRAINT "signup_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signup_invite_email_uq" ON "signup_invite" USING btree ("email");