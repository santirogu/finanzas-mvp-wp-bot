ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_monthly_limit_changed';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_replies_resent';--> statement-breakpoint
ALTER TABLE "bot_setting" ADD COLUMN "monthly_token_limit" integer;--> statement-breakpoint
ALTER TABLE "bot_setting" ADD CONSTRAINT "bot_setting_monthly_token_limit" CHECK ("bot_setting"."monthly_token_limit" is null or "bot_setting"."monthly_token_limit" > 0);