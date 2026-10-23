import { type RegisterReminder, reminderNotificationId } from "@/modules/reminders/register-reminder";
import type { UpcomingItem } from "@/modules/reports/upcoming";

// Las notificaciones de la campana (arriba, en todas las páginas): el recordatorio de registro y los avisos de
// próximos pagos de los gastos fijos. Cada una tiene un id con su tipo adelante ("registro|…", "pago|…"). "Marcar
// como leído" la saca de la campana (tabla notification_read); el aviso sigue en el Resumen hasta que se registre
// algo (el recordatorio) o el pago, o se marque "ya no aplica".

/** Lo más largo que puede ser un id (el mismo límite que pone la base). */
export const NOTIFICATION_ID_MAX = 200;

/** Cuántas se pueden marcar de una vez ("Marcar todas como leídas"). */
export const MARK_MAX = 50;

/** El id de un aviso de próximo pago: el mes del pago y la clave del gasto. */
export const paymentNotificationId = (item: Pick<UpcomingItem, "key" | "month">) => `pago|${item.month}|${item.key}`;

/** Un id bien formado: "pago|YYYY-MM|<clave>" o "registro|YYYY-MM-DD". */
export const isNotificationId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= NOTIFICATION_ID_MAX &&
  (/^pago\|\d{4}-(0[1-9]|1[0-2])\|.+$/.test(value) || /^registro\|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value));

export type BellNotification =
  | { kind: "payment"; id: string; item: UpcomingItem }
  | { kind: "reminder"; id: string; reminder: RegisterReminder };

/**
 * Las de la campana: las que la persona todavía no marcó como leídas. Primero el recordatorio de registro (si toca)
 * y después los avisos de pagos, en el mismo orden.
 */
export function unreadNotifications(items: UpcomingItem[], read: ReadonlySet<string>, reminder: RegisterReminder | null = null): BellNotification[] {
  const all: BellNotification[] = [
    ...(reminder ? [{ kind: "reminder" as const, id: reminderNotificationId(reminder), reminder }] : []),
    ...items.map((item) => ({ kind: "payment" as const, id: paymentNotificationId(item), item })),
  ];
  return all.filter((notification) => !read.has(notification.id));
}
