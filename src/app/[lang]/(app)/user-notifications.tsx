import { getLocale } from "@/i18n/server";
import { currentMonthRange, todayInTimezone } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { unreadNotifications } from "@/modules/notifications/notifications";
import { getReadNotifications } from "@/modules/notifications/reads";
import { getUpcomingPayments } from "@/modules/reports/queries";
import { upcomingItems } from "@/modules/reports/upcoming";
import { NotificationBell } from "./notification-bell";

/**
 * La campana del encabezado (src/app/[lang]/(app)/notification-bell.tsx) con las notificaciones sin leer de la
 * persona: por ahora, sus avisos de próximos pagos. Con los avisos apagados (Mi cuenta → Notificaciones),
 * no hay campana.
 */
export async function UserNotifications() {
  const user = await requireUser();
  const today = todayInTimezone(user.timezone);
  const [upcoming, read, locale] = await Promise.all([
    getUpcomingPayments(user.id, currentMonthRange(user.timezone), today),
    getReadNotifications(user.id),
    getLocale(),
  ]);
  if (!upcoming.enabled) return null;
  return <NotificationBell notifications={unreadNotifications(upcomingItems(upcoming.payments, today, user.currency, locale), read)} today={today} />;
}
