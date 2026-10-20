import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationSetting } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import type { ToastTone } from "@/lib/toasts";
import { DAYS_AHEAD, DAYS_AHEAD_MESSAGES, daysAheadPhrase, MAX_DAYS_AHEAD } from "./upcoming";

const TEXTS = texts(
  { saved: (when: string) => `Se guardó: te avisaremos ${when} de cada pago fijo`, off: "Se apagaron los avisos de próximos pagos" },
  { en: { saved: (when) => `Saved: we'll notify you ${when} each bill is due`, off: "Upcoming payment notices were turned off" } },
);

// La configuración de los avisos de próximos pagos (Mi cuenta → Notificaciones; la tabla
// notification_setting): si están prendidos y con cuántos días de anticipación. Sin fila, los valores por
// defecto. Reciben el userId ya validado por el Data Access Layer (src/lib/session.ts) y siempre filtran
// por él.

export type UpcomingSettings = { enabled: boolean; days: number };

export const DEFAULT_UPCOMING_SETTINGS: UpcomingSettings = { enabled: true, days: DAYS_AHEAD };

export async function getUpcomingSettings(userId: string): Promise<UpcomingSettings> {
  const [row] = await db
    .select({ enabled: notificationSetting.upcomingEnabled, days: notificationSetting.upcomingDays })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId));
  return row ?? DEFAULT_UPCOMING_SETTINGS;
}

export type UpcomingSettingsResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string; field?: "days" };

/** Los días como los escribió la persona: un entero de 0 a MAX_DAYS_AHEAD (con espacios alrededor, también). */
function parseDays(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\s*\d{1,2}\s*$/.test(raw)) return null;
  const days = Number(raw);
  return days <= MAX_DAYS_AHEAD ? days : null;
}

/**
 * Guarda la configuración. `enabled` es el interruptor ("on" si está prendido); `days`, el campo de los
 * días de anticipación. Apagados, el campo no llega (está inactivo) y se conservan los días que había.
 */
export async function saveUpcomingSettings(
  userId: string,
  raw: { enabled: unknown; days: unknown },
  locale: Locale = DEFAULT_LOCALE,
): Promise<UpcomingSettingsResult> {
  const enabled = raw.enabled === "on";
  let days: number;
  if (raw.days === null || raw.days === undefined) {
    if (enabled) return { ok: false, error: DAYS_AHEAD_MESSAGES[locale], field: "days" };
    days = (await getUpcomingSettings(userId)).days;
  } else {
    const parsed = parseDays(raw.days);
    if (parsed === null) return { ok: false, error: DAYS_AHEAD_MESSAGES[locale], field: "days" };
    days = parsed;
  }
  await db
    .insert(notificationSetting)
    .values({ userId, upcomingEnabled: enabled, upcomingDays: days })
    .onConflictDoUpdate({ target: notificationSetting.userId, set: { upcomingEnabled: enabled, upcomingDays: days, updatedAt: new Date() } });
  return enabled
    ? { ok: true, message: TEXTS[locale].saved(daysAheadPhrase(days, locale)), tone: "success" }
    : { ok: true, message: TEXTS[locale].off, tone: "removal" };
}
