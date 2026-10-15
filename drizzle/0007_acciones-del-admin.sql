ALTER TYPE "public"."account_event_type" ADD VALUE 'login_unlocked';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'sessions_revoked';--> statement-breakpoint
ALTER TYPE "public"."account_event_type" ADD VALUE 'account_deleted';--> statement-breakpoint
CREATE TABLE "admin_code_use" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_step" bigint NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_event" ADD COLUMN "admin_id" text;--> statement-breakpoint
ALTER TABLE "admin_code_use" ADD CONSTRAINT "admin_code_use_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_event" ADD CONSTRAINT "account_event_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;