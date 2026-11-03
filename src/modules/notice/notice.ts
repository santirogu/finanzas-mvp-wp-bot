import { withoutControlChars } from "@/lib/text";

// El aviso para todos (Configuración del admin): lo que comparten el servidor, la franja que lo muestra y la
// ventana del admin. Sin dependencias del servidor.

export const NOTICE_TONES = ["info", "important"] as const;
export type NoticeTone = (typeof NOTICE_TONES)[number];
export const isNoticeTone = (value: unknown): value is NoticeTone => NOTICE_TONES.includes(value as NoticeTone);

/** El largo máximo de cada texto: unas cinco líneas en un celular, sin tapar la página. */
export const NOTICE_MAX_LENGTH = 200;
/** Hasta cuántos días puede durar: un aviso es de algo puntual. */
export const NOTICE_MAX_DAYS = 31;

/** El texto como se guarda: en una línea (los saltos y los espacios de más, un espacio) y sin caracteres de control. */
export const cleanNoticeText = (value: unknown) => withoutControlChars(typeof value === "string" ? value.replace(/\s+/g, " ") : "").trim();

/** El aviso que se ve: el texto en el idioma de la página y su versión (para cerrarlo). */
export type VisibleNotice = { message: string; tone: NoticeTone; version: string };

// La fecha de fin se escribe en hora de Colombia, con un campo datetime-local ("2026-10-25T20:00"). Colombia no
// cambia de hora en el año: siempre UTC−5.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-25T20:00" (hora de Colombia) → la fecha; null si no tiene ese formato o no existe (30 de febrero). */
export function parseBogotaDateTime(value: unknown): Date | null {
  const match = typeof value === "string" ? LOCAL_DATETIME.exec(value.trim()) : null;
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const back = new Date(utc);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return new Date(utc + BOGOTA_OFFSET_MS);
}

/** La fecha, como la escribe un campo datetime-local en hora de Colombia ("2026-10-25T20:00"). */
export const toBogotaDateTime = (date: Date) => new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 16);

/** El rango de la fecha de fin: desde ahora hasta NOTICE_MAX_DAYS días después. */
export const noticeEndBounds = (now: Date) => ({ min: now, max: new Date(now.getTime() + NOTICE_MAX_DAYS * 24 * 60 * 60 * 1000) });

/** La versión de un aviso: cambia cada vez que se publica, también si solo se corrige el texto. */
export const noticeVersion = (publishedAt: Date) => String(publishedAt.getTime());

/** La cookie que recuerda el aviso que la persona cerró, en este navegador (su versión). */
export const NOTICE_COOKIE = "aviso-cerrado";
/** Más que lo que puede durar un aviso: al vencer la cookie, ya no hay ese aviso. */
const NOTICE_COOKIE_MAX_AGE = (NOTICE_MAX_DAYS + 1) * 24 * 60 * 60;

/** La cookie para `document.cookie`: para todo el sitio y, con https, segura. */
export const noticeCookie = (version: string, secure: boolean) =>
  `${NOTICE_COOKIE}=${version}; Path=/; Max-Age=${NOTICE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
