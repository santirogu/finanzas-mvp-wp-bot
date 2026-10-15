CREATE TYPE "public"."account_event_type" AS ENUM('registered', 'whatsapp_code_created', 'whatsapp_linked', 'whatsapp_unlinked', 'whatsapp_link_failed');--> statement-breakpoint
CREATE TABLE "account_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"type" "account_event_type" NOT NULL,
	"phone" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_event" ADD CONSTRAINT "account_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_event_created_at_idx" ON "account_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_event_user_created_at_idx" ON "account_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "account_event_phone_idx" ON "account_event" USING btree ("phone");--> statement-breakpoint
-- Reconstrucción de la historia previa: lo que ya había en la base, marcado como reconstruido. No
-- se puede recuperar lo que se borró antes (desvinculaciones, códigos generados).
-- La prueba src/modules/account/events.int.test.ts corre estas mismas sentencias.
INSERT INTO "account_event" ("user_id", "type", "details", "created_at")
SELECT "id", 'registered', '{"reconstructed": true}'::jsonb, "created_at" FROM "user";--> statement-breakpoint
INSERT INTO "account_event" ("user_id", "type", "phone", "details", "created_at")
SELECT "user_id", 'whatsapp_linked', "phone", '{"reconstructed": true}'::jsonb, "linked_at" FROM "whatsapp_link";--> statement-breakpoint
INSERT INTO "account_event" ("type", "phone", "details", "created_at")
SELECT 'whatsapp_link_failed', "phone", '{"reconstructed": true}'::jsonb, "received_at" FROM "whatsapp_message" WHERE "status" = 'link_failed';
