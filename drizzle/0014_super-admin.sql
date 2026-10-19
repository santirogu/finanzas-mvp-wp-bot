ALTER TYPE "public"."account_event_type" ADD VALUE 'admin_granted' BEFORE 'bot_claude_paused';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'admin_revoked' BEFORE 'bot_claude_paused';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_one_super_admin_idx" ON "user" USING btree ("super_admin") WHERE "user"."super_admin";