import "server-only";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { currentMonthRange, todayInTimezone } from "@/lib/dates";
import type { CurrentUser } from "@/lib/session";
import { type ReportPeriod, reportPeriod } from "../period";
import { getExpensesByDay, getReport } from "../queries";
import { type ReportPdfView, reportPdfView } from "./view";

/**
 * El "Reporte (PDF)" del período que pide la URL (`?periodo=`, el mismo de la página), con los datos de
 * `user` (la persona de la sesión, ya validada por requireUser), en el idioma `locale`. `now`, para las pruebas.
 */
export async function reportPdfData(
  user: Pick<CurrentUser, "id" | "name" | "timezone" | "currency">,
  periodParam: unknown,
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ period: ReportPeriod; view: ReportPdfView }> {
  const current = currentMonthRange(user.timezone, now);
  const period = reportPeriod(periodParam, current, locale);
  const [report, byDay] = await Promise.all([
    getReport(user.id, period, current, locale),
    getExpensesByDay(user.id, period.months[0], period.months[period.months.length - 1]),
  ]);
  const today = todayInTimezone(user.timezone, now);
  return { period, view: reportPdfView({ report, period, byDay, current, today, name: user.name, currency: user.currency, locale }) };
}
