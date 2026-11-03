import type { BotAlertView } from "@/modules/admin/bot/alerts-view";
import type { BotAlert, BotAlertKind } from "@/modules/bot/alert-rules";
import { type RegisterReminder, reminderNotificationId } from "@/modules/reminders/register-reminder";
import type { UpcomingItem } from "@/modules/reports/upcoming";

// Las notificaciones de la campana (arriba, en todas las páginas): las alertas del bot (solo para los admins), el
// recordatorio de registro y los avisos de próximos pagos de los gastos fijos. Cada una tiene un id con su tipo
// adelante ("bot|…", "registro|…", "pago|…"). "Marcar como leído" la saca de la campana (tabla notification_read);
// el aviso sigue en el Resumen hasta que se registre algo (el recordatorio) o el pago, o se marque "ya no aplica", y
// la alerta, en la administración hasta que se arregle el problema.

/** Lo más largo que puede ser un id (el mismo límite que pone la base). */
export const NOTIFICATION_ID_MAX = 200;

/** Cuántas se pueden marcar de una vez ("Marcar todas como leídas"). */
export const MARK_MAX = 50;

/** El id de un aviso de próximo pago: el mes del pago y la clave del gasto. */
export const paymentNotificationId = (item: Pick<UpcomingItem, "key" | "month">) => `pago|${item.month}|${item.key}`;

// Todos los tipos de alerta del bot: si se agrega uno en alert-rules.ts, el compilador pide sumarlo aquí
// (MissingBotAlertKind deja de ser never).
const BOT_ALERT_KINDS = [
  "whatsapp_token",
  "whatsapp_send",
  "claude_key",
  "claude_model",
  "claude_credits",
  "claude_config",
  "claude_failing",
  "monthly_limit",
  "monthly_limit_near",
  "stuck_messages",
] as const satisfies readonly BotAlertKind[];
type MissingBotAlertKind = Exclude<BotAlertKind, (typeof BOT_ALERT_KINDS)[number]>;
const allBotAlertKinds: [MissingBotAlertKind] extends [never] ? true : MissingBotAlertKind = true;
void allBotAlertKinds;

/**
 * El id de una alerta del bot: su tipo y desde cuándo pasa. Si se arregla y vuelve a pasar, es otra (vuelve a la
 * campana aunque la anterior se haya marcado leída). El tope mensual va con el día en que se renueva (vuelve el mes
 * siguiente) y los mensajes sin procesar, con el día de hoy (`today`, YYYY-MM-DD): mientras sigan, vuelve cada día.
 */
export function botAlertNotificationId(alert: BotAlert, today: string): string {
  switch (alert.kind) {
    case "monthly_limit":
    case "monthly_limit_near":
      return `bot|${alert.kind}|${alert.resetsOn}`;
    case "stuck_messages":
      return `bot|${alert.kind}|${today}`;
    default:
      return `bot|${alert.kind}|${alert.since.toISOString()}`;
  }
}

const DAY = String.raw`\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`;
const REMINDER_ID = new RegExp(String.raw`^registro\|${DAY}$`);
const BOT_ID = new RegExp(String.raw`^bot\|([a-z_]+)\|${DAY}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$`);

/** Un id bien formado: "pago|YYYY-MM|<clave>", "registro|YYYY-MM-DD" o "bot|<tipo>|<fecha>". */
export const isNotificationId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= NOTIFICATION_ID_MAX &&
  (/^pago\|\d{4}-(0[1-9]|1[0-2])\|.+$/.test(value) ||
    REMINDER_ID.test(value) ||
    (BOT_ALERT_KINDS as readonly string[]).includes(BOT_ID.exec(value)?.[1] ?? ""));

/** Una alerta del bot para la campana: su id y cómo se lee (src/modules/admin/bot/alerts-view.ts). */
export type BellBotAlert = { id: string; alert: BotAlertView };

export type BellNotification =
  | { kind: "bot"; id: string; alert: BotAlertView }
  | { kind: "payment"; id: string; item: UpcomingItem }
  | { kind: "reminder"; id: string; reminder: RegisterReminder };

/**
 * Las de la campana: las que la persona todavía no marcó como leídas. Primero las alertas del bot (solo les llegan
 * a los admins), después el recordatorio de registro (si toca) y al final los avisos de pagos, en el mismo orden.
 */
export function unreadNotifications(
  items: UpcomingItem[],
  read: ReadonlySet<string>,
  reminder: RegisterReminder | null = null,
  botAlerts: readonly BellBotAlert[] = [],
): BellNotification[] {
  const all: BellNotification[] = [
    ...botAlerts.map(({ id, alert }) => ({ kind: "bot" as const, id, alert })),
    ...(reminder ? [{ kind: "reminder" as const, id: reminderNotificationId(reminder), reminder }] : []),
    ...items.map((item) => ({ kind: "payment" as const, id: paymentNotificationId(item), item })),
  ];
  return all.filter((notification) => !read.has(notification.id));
}
