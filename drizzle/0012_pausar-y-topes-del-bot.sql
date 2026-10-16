ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_claude_paused';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_claude_resumed';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_limits_changed';--> statement-breakpoint
CREATE TABLE "bot_setting" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"claude_paused" boolean DEFAULT false NOT NULL,
	"ai_per_hour" integer NOT NULL,
	"ai_per_day" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "bot_setting_single_row" CHECK ("bot_setting"."id" = 1),
	CONSTRAINT "bot_setting_ai_limits" CHECK ("bot_setting"."ai_per_hour" > 0 and "bot_setting"."ai_per_hour" <= "bot_setting"."ai_per_day")
);
--> statement-breakpoint
ALTER TABLE "bot_setting" ADD CONSTRAINT "bot_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;