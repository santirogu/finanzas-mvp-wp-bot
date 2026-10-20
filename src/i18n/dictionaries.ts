import type { Locale } from "./locales";
import { type Dictionary, es } from "./dictionaries/es";

export type { Dictionary };

/** Los textos de cada idioma. */
export const DICTIONARIES: Record<Locale, Dictionary> = { es };
