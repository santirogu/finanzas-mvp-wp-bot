CREATE TABLE "fixed_payment_skip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"description_key" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_payment_skip_month" CHECK ("fixed_payment_skip"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "fixed_payment_skip" ADD CONSTRAINT "fixed_payment_skip_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_payment_skip_user_key_month_uq" ON "fixed_payment_skip" USING btree ("user_id","description_key","month");