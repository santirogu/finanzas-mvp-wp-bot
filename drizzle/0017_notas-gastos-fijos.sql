CREATE TABLE "fixed_expense_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description_key" text NOT NULL,
	"month" text NOT NULL,
	"note" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_expense_note_length" CHECK (char_length("fixed_expense_note"."note") between 1 and 280),
	CONSTRAINT "fixed_expense_note_month" CHECK ("fixed_expense_note"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "fixed_expense_note" ADD CONSTRAINT "fixed_expense_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_expense_note_user_key_month_uq" ON "fixed_expense_note" USING btree ("user_id","description_key","month");