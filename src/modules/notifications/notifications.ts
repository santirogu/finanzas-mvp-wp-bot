import type { UpcomingItem } from "@/modules/reports/upcoming";

// Las notificaciones de la campana (arriba, en todas las páginas): por ahora, los avisos de próximos pagos
// de los gastos fijos. Cada una tiene un id con su tipo adelante ("pago|…"), para que más adelante entren
// otros tipos. "Marcar como leído" la saca de la campana (tabla notification_read); el aviso sigue en el
// Resumen hasta que se registre el pago o se marque "ya no aplica".

/** Lo más largo que puede ser un id (el mismo límite que pone la base). */
export const NOTIFICATION_ID_MAX = 200;

/** Cuántas se pueden marcar de una vez ("Marcar todas como leídas"). */
export const MARK_MAX = 50;

/** El id de un aviso de próximo pago: el mes del pago y la clave del gasto. */
export const paymentNotificationId = (item: Pick<UpcomingItem, "key" | "month">) => `pago|${item.month}|${item.key}`;

/** Un id bien formado: "pago|YYYY-MM|<clave>" (el único tipo, por ahora). */
export const isNotificationId = (value: unknown): value is string =>
  typeof value === "string" && value.length <= NOTIFICATION_ID_MAX && /^pago\|\d{4}-(0[1-9]|1[0-2])\|.+$/.test(value);

export type BellNotification = { id: string; item: UpcomingItem };

/** Las de la campana: los avisos que la persona todavía no marcó como leídos, en el mismo orden. */
export function unreadNotifications(items: UpcomingItem[], read: ReadonlySet<string>): BellNotification[] {
  return items.map((item) => ({ id: paymentNotificationId(item), item })).filter((notification) => !read.has(notification.id));
}
