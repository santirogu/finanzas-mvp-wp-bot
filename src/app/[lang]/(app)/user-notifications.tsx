import { getLocale } from "@/i18n/server";
import { currentMonthRange, todayInTimezone } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { unreadNotifications } from "@/modules/notifications/notifications";
import { getReadNotifications } from "@/modules/notifications/reads";
import { getRegisterReminder, getReminderSettings } from "@/modules/reminders/reminders";
import { getUpcomingPayments } from "@/modules/reports/queries";
import { upcomingItems } from "@/modules/reports/upcoming";
import { NotificationBell } from "./notification-bell";

/**
 * La campana del encabezado (src/app/[lang]/(app)/notification-bell.tsx) con las notificaciones sin leer de la
 * persona: el recordatorio de registro y sus avisos de próximos pagos. Con los dos apagados (en Configuración), no
 * hay campana.
 */
export async function UserNotifications() {
  const user = await requireUser();
  const today = todayInTimezone(user.timezone);
  const locale = await getLocale();
  const [upcoming, read, reminderSettings, reminder] = await Promise.all([
    getUpcomingPayments(user.id, currentMonthRange(user.timezone), today, locale),
    getReadNotifications(user.id),
    getReminderSettings(user.id),
    getRegisterReminder(user.id, user.timezone, today),
  ]);
  if (!upcoming.enabled && !reminderSettings.enabled) return null;
  return (
    <NotificationBell
      notifications={unreadNotifications(upcomingItems(upcoming.payments, today, user.currency, locale), read, reminder)}
      today={today}
      upcomingEnabled={upcoming.enabled}
    />
  );
}
