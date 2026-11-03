ALTER TABLE "user" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_theme_check" CHECK ("user"."theme" in ('system', 'light', 'dark'));