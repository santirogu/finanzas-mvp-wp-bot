ALTER TABLE "user" ADD COLUMN "gmf_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tax_of" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_tax_of_transaction_id_fk" FOREIGN KEY ("tax_of") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_tax_of_uq" ON "transaction" USING btree ("tax_of");