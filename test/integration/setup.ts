// Se ejecuta en cada archivo de integración: datos limpios antes de cada prueba.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { db } from "@/db";
import { resetGlobalCategories } from "./categories";

beforeEach(async () => {
  // Borrar usuarios elimina en cascada sesiones, movimientos, categorías propias y vínculos.
  // Las categorías globales (user_id NULL) se conservan.
  await db.execute(sql`delete from "user"`);
  await db.execute(sql`delete from whatsapp_message`);
  // Los eventos de una cuenta se van con ella; los intentos sin cuenta, no.
  await db.execute(sql`delete from account_event`);
  await db.execute(sql`delete from verification`);
  await db.execute(sql`delete from rate_limit`);
  await db.execute(sql`delete from login_failure`);
  await db.execute(sql`delete from category_change`);
  // La configuración del bot (/admin/bot): sin fila, Claude activo y los topes de siempre.
  await db.execute(sql`delete from bot_setting`);
  await resetGlobalCategories();
});

afterAll(async () => {
  const cached = globalThis as unknown as { pgClient?: { end: () => Promise<void> } };
  await cached.pgClient?.end();
});
