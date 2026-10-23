import "server-only";
import { and, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db";
import { reminderSetting, transaction, user } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { todayInTimezone } from "@/lib/dates";
import type { ToastTone } from "@/lib/toasts";
import {
  DEFAULT_REMINDER_SETTINGS,
  type RegisterReminder,
  registerReminder,
  REMINDER_DAYS_MAX,
  REMINDER_DAYS_MESSAGES,
  REMINDER_DAYS_MIN,
  type ReminderSettings,
} from "./register-reminder";

// La configuración del recordatorio de registro (la tabla reminder_setting) y el recordatorio de una cuenta. Reciben
// el userId ya validado por el Data Access Layer (src/lib/session.ts) y siempre filtran por él.

export async function getReminderSettings(userId: string): Promise<ReminderSettings> {
  const [row] = await db.select({ enabled: reminderSetting.enabled, days: reminderSetting.days }).from(reminderSetting).where(eq(reminderSetting.userId, userId));
  return row ?? DEFAULT_REMINDER_SETTINGS;
}

/**
 * El recordatorio de hoy (`today`, YYYY-MM-DD en la zona de la persona), o null si no toca: el día de su último
 * movimiento registrado (por la web o por WhatsApp, sin los eliminados) o, si nunca registró, el de su cuenta.
 */
export async function getRegisterReminder(userId: string, timezone: string, today: string): Promise<RegisterReminder | null> {
  const [settings, [last], [account]] = await Promise.all([
    getReminderSettings(userId),
    db
      .select({ at: max(transaction.createdAt) })
      .from(transaction)
      .where(and(eq(transaction.userId, userId), isNull(transaction.deletedAt))),
    db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId)),
  ]);
  if (!account) return null;
  return registerReminder({
    lastRegistered: last?.at ? todayInTimezone(timezone, last.at) : null,
    accountCreated: todayInTimezone(timezone, account.createdAt),
    today,
    settings,
  });
}

const TEXTS = texts(
  {
    days: REMINDER_DAYS_MESSAGES.es,
    saved: (days: number) => `Se guardó: te lo recordaremos si ${days === 1 ? "pasa 1 día" : `pasan ${days} días`} sin registrar nada`,
    off: "Se apagó el recordatorio de registro",
  },
  {
    en: {
      days: REMINDER_DAYS_MESSAGES.en,
      saved: (days) => `Saved: we'll remind you if ${days} ${days === 1 ? "day goes" : "days go"} by without adding anything`,
      off: "The reminder to add transactions was turned off",
    },
  },
);

export type ReminderSettingsResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string; field?: "days" };

/** Los días como los escribió la persona: un entero de REMINDER_DAYS_MIN a REMINDER_DAYS_MAX (con espacios alrededor). */
function parseDays(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\s*\d{1,2}\s*$/.test(raw)) return null;
  const days = Number(raw);
  return days >= REMINDER_DAYS_MIN && days <= REMINDER_DAYS_MAX ? days : null;
}

/**
 * Guarda la configuración. `enabled` es el interruptor ("on" si está prendido); `days`, el campo de los días.
 * Apagado, el campo no llega (está inactivo) y se conservan los días que había.
 */
export async function saveReminderSettings(
  userId: string,
  raw: { enabled: unknown; days: unknown },
  locale: Locale = DEFAULT_LOCALE,
): Promise<ReminderSettingsResult> {
  const t = TEXTS[locale];
  const enabled = raw.enabled === "on";
  let days: number;
  if (raw.days === null || raw.days === undefined) {
    if (enabled) return { ok: false, error: t.days, field: "days" };
    days = (await getReminderSettings(userId)).days;
  } else {
    const parsed = parseDays(raw.days);
    if (parsed === null) return { ok: false, error: t.days, field: "days" };
    days = parsed;
  }
  await db
    .insert(reminderSetting)
    .values({ userId, enabled, days })
    .onConflictDoUpdate({ target: reminderSetting.userId, set: { enabled, days, updatedAt: new Date() } });
  return enabled ? { ok: true, message: t.saved(days), tone: "success" } : { ok: true, message: t.off, tone: "removal" };
}
