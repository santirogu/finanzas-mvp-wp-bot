import { getLocale } from "@/i18n/server";
import { currentMonthRange, todayInTimezone } from "@/lib/dates";
import { canAdminister, requireUser } from "@/lib/session";
import { botAlerts } from "@/modules/admin/bot/alerts";
import { alertView } from "@/modules/admin/bot/alerts-view";
import type { BotAlert } from "@/modules/bot/alert-rules";
import { botAlertNotificationId, unreadNotifications } from "@/modules/notifications/notifications";
import { getReadNotifications } from "@/modules/notifications/reads";
import { getRegisterReminder, getReminderSettings } from "@/modules/reminders/reminders";
import { getUpcomingPayments } from "@/modules/reports/queries";
import { upcomingItems } from "@/modules/reports/upcoming";
import { NotificationBell } from "./notification-bell";

/**
 * La campana del encabezado (src/app/[lang]/(app)/notification-bell.tsx) con las notificaciones sin leer de la
 * persona: el recordatorio de registro y sus avisos de próximos pagos y, si puede administrar, las alertas del bot
 * (las mismas del Inicio del admin, que no se apagan). Sin alertas y con los otros dos apagados (en Configuración),
 * no hay campana.
 */
export async function UserNotifications() {
  const user = await requireUser();
  const today = todayInTimezone(user.timezone);
  const locale = await getLocale();
  const [upcoming, read, reminderSettings, reminder, alerts] = await Promise.all([
    getUpcomingPayments(user.id, currentMonthRange(user.timezone), today, locale),
    getReadNotifications(user.id),
    getReminderSettings(user.id),
    getRegisterReminder(user.id, user.timezone, today),
    canAdminister(user) ? botAlerts() : Promise.resolve<BotAlert[]>([]),
  ]);
  if (!upcoming.enabled && !reminderSettings.enabled && alerts.length === 0) return null;
  const bot = alerts.map((alert) => ({ id: botAlertNotificationId(alert, today), alert: alertView(alert, locale) }));
  return (
    <NotificationBell
      notifications={unreadNotifications(upcomingItems(upcoming.payments, today, user.currency, locale), read, reminder, bot)}
      today={today}
      upcomingEnabled={upcoming.enabled}
    />
  );
}
