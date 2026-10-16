// Límites del bot de WhatsApp (auditoría de seguridad 2026-10-15). Sin dependencias: los aplican
// src/modules/bot/ai-quota.ts, src/modules/whatsapp/link.ts y normalize.ts, y se prueban aparte.

/**
 * Mensajes de una cuenta que se pueden interpretar con Claude. Cada uno es una llamada a la API
 * (con costo): sin tope, alguien podría gastar el crédito de la cuenta de Anthropic y dejar el bot
 * sin servicio para todos. Los comandos (balance, deshacer, ayuda) no cuentan: no usan IA.
 */
export const AI_LIMITS = { perHour: 20, perDay: 100 } as const;

/** Vinculación de WhatsApp: códigos equivocados por número y códigos nuevos por cuenta, por hora. */
export const LINK_LIMITS = { failedAttemptsPerHour: 5, codesPerHour: 5 } as const;

/** Movimientos que se registran de un solo mensaje; si la IA propone más, se pide dividirlo. */
export const MAX_TRANSACTIONS_PER_MESSAGE = 20;

/** Largo máximo de la respuesta libre del modelo (cuando no hay movimientos). */
export const MAX_REPLY_LENGTH = 300;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** ¿Ya se usó el cupo de mensajes interpretados (en la última hora o en las últimas 24 horas)? */
export function aiQuotaExceeded(used: { lastHour: number; lastDay: number }): boolean {
  return used.lastHour >= AI_LIMITS.perHour || used.lastDay >= AI_LIMITS.perDay;
}
