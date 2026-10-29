ALTER TABLE "user" ADD COLUMN "tutorial_done_at" timestamp with time zone;--> statement-breakpoint
-- El tutorial de bienvenida es solo para las cuentas nuevas (decisión del dueño): las que ya existen quedan como
-- si lo hubieran visto.
UPDATE "user" SET "tutorial_done_at" = now() WHERE "tutorial_done_at" IS NULL;
