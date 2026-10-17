// Límites del bot de WhatsApp (auditoría de seguridad 2026-10-15). Sin dependencias: los aplican
// src/modules/bot/ai-quota.ts, src/modules/whatsapp/link.ts y normalize.ts, y se prueban aparte.

/**
 * Mensajes de una cuenta que se pueden interpretar con Claude. Cada uno es una llamada a la API
 * (con costo): sin tope, alguien podría gastar el crédito de la cuenta de Anthropic y dejar el bot
 * sin servicio para todos. Los comandos (balance, deshacer, ayuda) no cuentan: no usan IA.
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

/** El tope que escribió el admin: vacío es sin tope; si no, un entero dentro de MONTHLY_TOKEN_BOUNDS. */
export function parseMonthlyTokenLimit(raw: string): MonthlyLimitInput {
  const text = raw.replace(/[\s.]/g, "");
  if (text === "") return { ok: true, limit: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Escribe cuántos tokens al mes, en números (o déjalo vacío para no tener tope)." };
  const limit = Number(text);
  const { min, max } = MONTHLY_TOKEN_BOUNDS;
  const count = new Intl.NumberFormat("es-CO").format;
  if (limit < min || limit > max) return { ok: false, error: `El tope mensual va de ${count(min)} a ${count(max)} tokens.` };
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

const LIMIT_NAMES = { perHour: "por hora", perDay: "por día" } as const;

/**
 * Los topes que escribió el admin: enteros dentro de AI_LIMIT_BOUNDS, y el de una hora no mayor que
 * el del día (no podría alcanzarse). Acepta "1.000" o espacios; el error dice qué campo y por qué.
 */
export function parseAiLimits(raw: { perHour: string; perDay: string }): AiLimitsInput {
  const limits = { perHour: 0, perDay: 0 };
  for (const field of ["perHour", "perDay"] as const) {
    const text = raw[field].replace(/[\s.]/g, "");
    const { min, max } = AI_LIMIT_BOUNDS[field];
    if (!/^\d+$/.test(text)) return { ok: false, field, error: `Escribe cuántos mensajes ${LIMIT_NAMES[field]}, en números.` };
    const value = Number(text);
    if (value < min || value > max) {
      return { ok: false, field, error: `El tope ${LIMIT_NAMES[field]} va de ${min} a ${new Intl.NumberFormat("es-CO").format(max)}.` };
    }
    limits[field] = value;
  }
  if (limits.perHour > limits.perDay) {
    return { ok: false, field: "perHour", error: "El tope por hora no puede ser mayor que el del día." };
  }
  return { ok: true, limits };
}
