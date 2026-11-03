CREATE TABLE "fixed_payment_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"description_key" text NOT NULL,
	"month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_payment_link_month" CHECK ("fixed_payment_link"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "fixed_payment_link" ADD CONSTRAINT "fixed_payment_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_payment_link" ADD CONSTRAINT "fixed_payment_link_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_payment_link_transaction_uq" ON "fixed_payment_link" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "fixed_payment_link_user_key_idx" ON "fixed_payment_link" USING btree ("user_id","description_key");