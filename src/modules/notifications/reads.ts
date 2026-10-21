import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationRead } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import type { ToastTone } from "@/lib/toasts";
import { isNotificationId, MARK_MAX } from "./notifications";

// Las notificaciones que la persona marcó como leídas (la tabla notification_read). Reciben el userId ya
// validado por el Data Access Layer (src/lib/session.ts) y siempre filtran por él.

export async function getReadNotifications(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: notificationRead.notificationId }).from(notificationRead).where(eq(notificationRead.userId, userId));
  return new Set(rows.map((row) => row.id));
}

export type MarkReadResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string };

const TEXTS = texts(
  { error: "No se pudo marcar como leída. Intenta de nuevo.", one: "Se marcó como leída", many: (n: number) => `Se marcaron ${n} como leídas` },
  { en: { error: "It couldn't be marked as read. Try again.", one: "Marked as read", many: (n) => `${n} marked as read` } },
);

/** Marca como leídas las notificaciones `ids` (una o varias). Marcar dos veces la misma no hace nada. */
export async function markNotificationsRead(userId: string, ids: unknown[], locale: Locale = DEFAULT_LOCALE): Promise<MarkReadResult> {
  const t = TEXTS[locale];
  if (ids.length === 0 || ids.length > MARK_MAX || !ids.every(isNotificationId)) return { ok: false, error: t.error };
  const unique = [...new Set(ids)];
  await db
    .insert(notificationRead)
    .values(unique.map((notificationId) => ({ userId, notificationId })))
    .onConflictDoNothing();
  return { ok: true, message: unique.length === 1 ? t.one : t.many(unique.length), tone: "success" };
}
