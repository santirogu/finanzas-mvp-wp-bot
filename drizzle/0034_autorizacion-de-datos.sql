ALTER TYPE "public"."account_event_type" ADD VALUE 'privacy_accepted' BEFORE 'login_unlocked';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_accepted_at" timestamp with time zone;