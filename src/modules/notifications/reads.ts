import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationRead } from "@/db/schema";
import type { ToastTone } from "@/lib/toasts";
import { isNotificationId, MARK_MAX } from "./notifications";

// Las notificaciones que la persona marcó como leídas (la tabla notification_read). Reciben el userId ya
// validado por el Data Access Layer (src/lib/session.ts) y siempre filtran por él.

export async function getReadNotifications(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: notificationRead.notificationId }).from(notificationRead).where(eq(notificationRead.userId, userId));
  return new Set(rows.map((row) => row.id));
}

export type MarkReadResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string };

/** Marca como leídas las notificaciones `ids` (una o varias). Marcar dos veces la misma no hace nada. */
export async function markNotificationsRead(userId: string, ids: unknown[]): Promise<MarkReadResult> {
  if (ids.length === 0 || ids.length > MARK_MAX || !ids.every(isNotificationId)) return { ok: false, error: "No se pudo marcar como leída." };
  const unique = [...new Set(ids)];
  await db
    .insert(notificationRead)
    .values(unique.map((notificationId) => ({ userId, notificationId })))
    .onConflictDoNothing();
  return { ok: true, message: unique.length === 1 ? "Se marcó como leída" : `Se marcaron ${unique.length} como leídas`, tone: "success" };
}
