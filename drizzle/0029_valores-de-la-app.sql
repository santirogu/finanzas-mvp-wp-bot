ALTER TYPE "public"."account_event_type" ADD VALUE 'app_values_changed';--> statement-breakpoint
CREATE TABLE "app_values" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"upcoming_enabled" boolean NOT NULL,
	"upcoming_days" smallint NOT NULL,
	"budget_near_share" smallint NOT NULL,
	"recurring_min_months" smallint NOT NULL,
	"recurring_window" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "app_values_single_row" CHECK ("app_values"."id" = 1),
	CONSTRAINT "app_values_upcoming_days" CHECK ("app_values"."upcoming_days" between 0 and 10),
	CONSTRAINT "app_values_budget_near_share" CHECK ("app_values"."budget_near_share" between 50 and 95),
	CONSTRAINT "app_values_recurring" CHECK ("app_values"."recurring_window" between 3 and 6 and "app_values"."recurring_min_months" between 2 and "app_values"."recurring_window")
);
--> statement-breakpoint
ALTER TABLE "app_values" ADD CONSTRAINT "app_values_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;