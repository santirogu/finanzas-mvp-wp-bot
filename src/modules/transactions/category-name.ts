import { sql, type SQL } from "drizzle-orm";
import { category } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

// El nombre de una categoría en el idioma de la página: en inglés, el que le puso el admin a una global
// (`name_en`, en /admin/categorias) o, si no tiene, el de siempre. El bot y lo que se guarda usan siempre
// `name`: esto es solo para mostrar.

/** Para las consultas que traen la categoría de un movimiento (null si no tiene). */
export function categoryNameIn(locale: Locale = DEFAULT_LOCALE): SQL<string | null> {
  return locale === "en" ? sql<string | null>`coalesce(${category.nameEn}, ${category.name})` : sql<string | null>`${category.name}`;
}

/** Para una categoría ya leída, con su `name` y su `nameEn`. */
export const categoryLabel = (row: { name: string; nameEn: string | null }, locale: Locale = DEFAULT_LOCALE) =>
  (locale === "en" && row.nameEn) || row.name;
