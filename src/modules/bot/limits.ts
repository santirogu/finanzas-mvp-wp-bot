// Límites del bot de WhatsApp (auditoría de seguridad 2026-10-15). Sin dependencias (solo los idiomas): los
// aplican src/modules/bot/ai-quota.ts, src/modules/whatsapp/link.ts y normalize.ts, y se prueban aparte.

import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";

/**
 * Mensajes de una cuenta que se pueden interpretar con Claude. Cada uno es una llamada a la API
 * (con costo): sin tope, alguien podría gastar el crédito de la cuenta de Anthropic y dejar el bot
 * sin servicio para todos. Los comandos (balance, reporte, deshacer, ayuda) no cuentan: no usan IA.
 */
export const AI_LIMITS = { perHour: 20, perDay: 100 } as const;

/** Los topes de Claude por cuenta: los de AI_LIMITS hasta que el admin los cambie en /admin/bot. */
export type AiLimits = { perHour: number; perDay: number };

/**
 * Hasta dónde los puede subir el admin. Con ~1.700 tokens de entrada por mensaje (producción,
 * octubre de 2026), 2.000 al día son unos 3,4 millones de tokens por cuenta: el techo protege el
 * crédito aunque alguien se equivoque al escribir.
 */
export const AI_LIMIT_BOUNDS = { perHour: { min: 1, max: 200 }, perDay: { min: 1, max: 2000 } } as const;

/** Vinculación de WhatsApp: códigos equivocados por número y códigos nuevos por cuenta, por hora. */
export const LINK_LIMITS = { failedAttemptsPerHour: 5, codesPerHour: 5 } as const;

/** Movimientos que se registran de un solo mensaje; si la IA propone más, se pide dividirlo. */
export const MAX_TRANSACTIONS_PER_MESSAGE = 20;

/** Largo máximo de la respuesta libre del modelo (cuando no hay movimientos). */
export const MAX_REPLY_LENGTH = 300;

/**
 * El tope mensual de tokens de Claude, de todas las cuentas (opcional: sin él no hay tope). Con
 * ~1.800 tokens por mensaje, 10.000 son unos 5 mensajes y 100 millones, unos 55.000. Cuenta el mes en
 * hora de Colombia (la de la administración).
 */
export const MONTHLY_TOKEN_BOUNDS = { min: 10_000, max: 100_000_000 } as const;
export const TOKEN_BUDGET_TIMEZONE = "America/Bogota";

/** ¿Este mes ya se usaron los tokens del tope? Sin tope (null), nunca. */
export const monthlyBudgetReached = (limit: number | null, used: number) => limit !== null && used >= limit;

export type MonthlyLimitInput = { ok: true; limit: number | null } | { ok: false; error: string };

// Lo que escribe el admin en /admin/bot, en el idioma de la página: los miles van con el separador de ese
// idioma ("1.000" en español, "1,000" en inglés) y los mensajes, en sus palabras.
const LIMIT_TEXTS = {
  es: {
    thousands: /[\s.]/g,
    names: { perHour: "por hora", perDay: "por día" },
    monthlyNumber: "Escribe cuántos tokens al mes, en números (o déjalo vacío para no tener tope).",
    monthlyRange: (min: string, max: string) => `El tope mensual va de ${min} a ${max} tokens.`,
    number: (name: string) => `Escribe cuántos mensajes ${name}, en números.`,
    range: (name: string, min: string, max: string) => `El tope ${name} va de ${min} a ${max}.`,
    hourOverDay: "El tope por hora no puede ser mayor que el del día.",
  },
  en: {
    thousands: /[\s,]/g,
    names: { perHour: "per hour", perDay: "per day" },
    monthlyNumber: "Enter how many tokens a month, in numbers (or leave it empty for no limit).",
    monthlyRange: (min: string, max: string) => `The monthly limit goes from ${min} to ${max} tokens.`,
    number: (name: string) => `Enter how many messages ${name}, in numbers.`,
    range: (name: string, min: string, max: string) => `The limit ${name} goes from ${min} to ${max}.`,
    hourOverDay: "The hourly limit can't be higher than the daily one.",
  },
} as const satisfies Record<Locale, unknown>;

/** El tope que escribió el admin: vacío es sin tope; si no, un entero dentro de MONTHLY_TOKEN_BOUNDS. */
export function parseMonthlyTokenLimit(raw: string, locale: Locale = DEFAULT_LOCALE): MonthlyLimitInput {
  const t = LIMIT_TEXTS[locale];
  const text = raw.replace(t.thousands, "");
  if (text === "") return { ok: true, limit: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: t.monthlyNumber };
  const limit = Number(text);
  const { min, max } = MONTHLY_TOKEN_BOUNDS;
  const count = new Intl.NumberFormat(INTL_LOCALES[locale]).format;
  if (limit < min || limit > max) return { ok: false, error: t.monthlyRange(count(min), count(max)) };
  return { ok: true, limit };
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** ¿Ya se usó el cupo de mensajes interpretados (en la última hora o en las últimas 24 horas)? */
export function aiQuotaExceeded(used: { lastHour: number; lastDay: number }, limits: AiLimits = AI_LIMITS): boolean {
  return used.lastHour >= limits.perHour || used.lastDay >= limits.perDay;
}

export type AiLimitsInput =
  | { ok: true; limits: AiLimits }
  | { ok: false; field: "perHour" | "perDay"; error: string };

/**
 * Los topes que escribió el admin: enteros dentro de AI_LIMIT_BOUNDS, y el de una hora no mayor que
 * el del día (no podría alcanzarse). Acepta "1.000" (en inglés, "1,000") o espacios; el error dice qué
 * campo y por qué.
 */
export function parseAiLimits(raw: { perHour: string; perDay: string }, locale: Locale = DEFAULT_LOCALE): AiLimitsInput {
  const t = LIMIT_TEXTS[locale];
  const count = new Intl.NumberFormat(INTL_LOCALES[locale]).format;
  // Stryker disable next-line ObjectLiteral: los dos campos se llenan antes de usarse (o la función vuelve antes)
  const limits = { perHour: 0, perDay: 0 };
  for (const field of ["perHour", "perDay"] as const) {
    const text = raw[field].replace(t.thousands, "");
    const { min, max } = AI_LIMIT_BOUNDS[field];
    if (!/^\d+$/.test(text)) return { ok: false, field, error: t.number(t.names[field]) };
    const value = Number(text);
    if (value < min || value > max) {
      return { ok: false, field, error: t.range(t.names[field], String(min), count(max)) };
    }
    limits[field] = value;
  }
  if (limits.perHour > limits.perDay) {
    return { ok: false, field: "perHour", error: t.hourOverDay };
  }
  return { ok: true, limits };
}
