ALTER TYPE "public"."account_event_type" ADD VALUE 'bot_model_changed';--> statement-breakpoint
ALTER TABLE "bot_setting" ADD COLUMN "model" text;