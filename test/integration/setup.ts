// Se ejecuta en cada archivo de integración: datos limpios antes de cada prueba.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { db } from "@/db";

beforeEach(async () => {
  // Borrar usuarios elimina en cascada sesiones, movimientos, categorías propias y vínculos.
  // Las categorías globales (user_id NULL) se conservan.
  await db.execute(sql`delete from "user"`);
  await db.execute(sql`delete from whatsapp_message`);
  await db.execute(sql`delete from verification`);
});

afterAll(async () => {
  const cached = globalThis as unknown as { pgClient?: { end: () => Promise<void> } };
  await cached.pgClient?.end();
});
