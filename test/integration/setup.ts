// Se ejecuta en cada archivo de integración: datos limpios antes de cada prueba.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { resetGlobalCategories } from "./categories";
import { requestLocale } from "./locale";

// Las Server Actions leen el idioma de la cookie (src/i18n/request.ts), que fuera de un pedido no existe:
// aquí sale de requestLocale (español, salvo que la prueba pida otro). src/i18n/request.test.ts prueba la
// lectura de la cookie.
vi.mock("@/i18n/request", () => ({ getRequestLocale: async () => requestLocale.value }));

beforeEach(async () => {
  requestLocale.value = "es";
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
  // Las corridas de la limpieza diaria (/admin/salud).
  await db.execute(sql`delete from cron_run`);
  // La configuración de la app (/admin/configuracion): sin fila, los registros abiertos.
  await db.execute(sql`delete from app_setting`);
  await db.execute(sql`delete from signup_invite`);
  // El aviso para todos: sin fila, ninguno.
  await db.execute(sql`delete from app_notice`);
  await resetGlobalCategories();
});

afterAll(async () => {
  const cached = globalThis as unknown as { pgClient?: { end: () => Promise<void> } };
  await cached.pgClient?.end();
});
