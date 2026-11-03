import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";

// El recordatorio de registro (el Resumen y la campana): si la persona lleva varios días sin registrar nada, se lo
// recordamos, para que las cuentas del mes no queden incompletas. Solo en la web (decisión del dueño: por WhatsApp
// haría falta una plantilla aprobada por Meta, que se cobra por mensaje). Se configura en Configuración →
// Recordatorio de registro (src/modules/reminders/reminders.ts). Sin dependencias del servidor.

/** Desde cuántos días sin registrar, si la persona no eligió otro. */
export const REMINDER_DAYS = 3;
/** El rango de los días (la base lo revisa también: reminder_setting). */
export const REMINDER_DAYS_MIN = 1;
export const REMINDER_DAYS_MAX = 14;

/** El error del campo de los días (en el navegador y en el servidor), en cada idioma. */
export const REMINDER_DAYS_MESSAGES: Readonly<Record<Locale, string>> = {
  es: `Escribe un número de días de ${REMINDER_DAYS_MIN} a ${REMINDER_DAYS_MAX}.`,
  en: `Enter a number of days from ${REMINDER_DAYS_MIN} to ${REMINDER_DAYS_MAX}.`,
};

export type ReminderSettings = { enabled: boolean; days: number };
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, days: REMINDER_DAYS };

export type RegisterReminder = {
  /** Desde cuándo no registra nada (YYYY-MM-DD): el día de su último movimiento o, si nunca registró, el de su cuenta. */
  since: string;
  /** Cuántos días van desde entonces. */
  days: number;
  /** Todavía no ha registrado ningún movimiento. */
  firstTime: boolean;
};

/** Los días de una fecha a otra (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * El recordatorio de hoy, o null si no toca. `lastRegistered` es el día (en la zona de la persona) en que registró
 * su último movimiento (null si nunca); `accountCreated`, el día en que creó la cuenta: una cuenta nueva no recibe
 * el recordatorio antes de tiempo.
 */
export function registerReminder({
  lastRegistered,
  accountCreated,
  today,
  settings,
}: {
  lastRegistered: string | null;
  accountCreated: string;
  today: string;
  settings: ReminderSettings;
}): RegisterReminder | null {
  if (!settings.enabled) return null;
  const since = lastRegistered ?? accountCreated;
  const days = daysBetween(since, today);
  return days >= settings.days ? { since, days, firstTime: lastRegistered === null } : null;
}

/** El id de su notificación en la campana: marcarla leída la saca hasta el próximo hueco (otra fecha). */
export const reminderNotificationId = (reminder: Pick<RegisterReminder, "since">) => `registro|${reminder.since}`;

const TEXTS = texts(
  {
    gap: (days: number) => `Llevas ${days} ${days === 1 ? "día" : "días"} sin registrar nada.`,
    first: "Todavía no registras ningún movimiento.",
    hint: "Registra lo que te falte para que tus cuentas del mes queden completas.",
  },
  {
    en: {
      gap: (days) => `You haven't added anything in ${days} ${days === 1 ? "day" : "days"}.`,
      first: "You haven't added any transactions yet.",
      hint: "Add what's missing so your month's numbers stay complete.",
    },
  },
);

/** El recordatorio en una frase ("Llevas 4 días sin registrar nada.") y qué hacer ("Registra lo que te falte…"). */
export function reminderText(reminder: RegisterReminder, locale: Locale = DEFAULT_LOCALE): { title: string; hint: string } {
  const t = TEXTS[locale];
  return { title: reminder.firstTime ? t.first : t.gap(reminder.days), hint: t.hint };
}
