CREATE TYPE "public"."fixed_expense_choice_kind" AS ENUM('include', 'exclude');--> statement-breakpoint
CREATE TABLE "fixed_expense_choice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description_key" text NOT NULL,
	"choice" "fixed_expense_choice_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixed_expense_choice" ADD CONSTRAINT "fixed_expense_choice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_expense_choice_user_key_uq" ON "fixed_expense_choice" USING btree ("user_id","description_key");