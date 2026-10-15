ALTER TYPE "public"."account_event_type" ADD VALUE 'account_suspended';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'account_reactivated';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspension_reason" text;