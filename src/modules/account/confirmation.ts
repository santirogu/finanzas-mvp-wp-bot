import type { Locale } from "@/i18n/locales";

// Palabra que hay que escribir para eliminar la cuenta: evita borrarla por accidente. Va en el idioma
// de la página (el servidor pide la del idioma de quien hace el pedido).
export const CONFIRMATION_WORDS: Readonly<Record<Locale, string>> = { es: "ELIMINAR", en: "DELETE" };

/** La de español (la de siempre). */
export const CONFIRMATION_WORD = CONFIRMATION_WORDS.es;
