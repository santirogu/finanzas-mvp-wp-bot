// Categorías (/admin/categorias): validar lo que escribe el admin, comparar nombres, ordenar y las
// frases del registro de cambios. Sin base de datos (las consultas están en categories.ts).

import type { CategoryChangeDetails } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { DEFAULT_CATEGORY } from "@/modules/transactions/default-categories";

// "Otros", la comparación de nombres y el orden son comunes con los formularios y el bot.
export { DEFAULT_CATEGORY, foldName, isDefaultCategory, sortCategories } from "@/modules/transactions/default-categories";

export type CategoryType = "expense" | "income";

export const CATEGORIES_PATH = "/admin/categorias";

/** El emoji de una categoría sin emoji. */
export const DEFAULT_EMOJI = "•";
export const CATEGORY_NAME_MAX = 40;

export const CATEGORY_TYPES = ["expense", "income"] as const;
/** El nombre de la pestaña y el de la frase ("Egresos" / "egresos"), en cada idioma. */
export const CATEGORY_TYPE_TEXTS: Readonly<Record<Locale, Record<CategoryType, string>>> = {
  es: { expense: "Egresos", income: "Ingresos" },
  en: { expense: "Expenses", income: "Income" },
};
/** En español (el de siempre). */
export const CATEGORY_TYPE_LABELS = CATEGORY_TYPE_TEXTS.es;
/** El parámetro de la URL de cada pestaña (?tipo=ingresos); egresos es la de por defecto. */
export const CATEGORY_TYPE_PARAMS: Record<CategoryType, string> = { expense: "egresos", income: "ingresos" };

/** Emojis para elegir rápido al crear o editar. */
export const EMOJI_SUGGESTIONS: Record<CategoryType, readonly string[]> = {
  expense: ["🍽️", "🛒", "🚌", "🏠", "💡", "🩺", "👟", "🎬", "📚", "💳", "🐾", "🎁"],
  income: ["💼", "💻", "🏷️", "📈", "🎁", "🏦", "🪙", "🤝"],
};

/** La pestaña de la URL: ingresos, o egresos por defecto. */
export const parseCategoryType = (value: string | string[] | undefined): CategoryType =>
  value === CATEGORY_TYPE_PARAMS.income ? "income" : "expense";

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const INPUT_TEXTS = {
  es: { noName: "Escribe un nombre.", tooLong: (max: number) => `Máximo ${max} caracteres.`, oneEmoji: "Escribe un solo emoji." },
  en: { noName: "Enter a name.", tooLong: (max: number) => `${max} characters at most.`, oneEmoji: "Enter a single emoji." },
} as const satisfies Record<Locale, unknown>;

/** El nombre que escribió el admin: en una línea, sin espacios de más ni caracteres de control. */
export function parseCategoryName(raw: string, locale: Locale = DEFAULT_LOCALE): Parsed<string> {
  const name = Array.from(raw.replace(/\s+/g, " "))
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("")
    .trim();
  if (!name) return { ok: false, error: INPUT_TEXTS[locale].noName };
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: INPUT_TEXTS[locale].tooLong(CATEGORY_NAME_MAX) };
  return { ok: true, value: name };
}

// Un emoji: un solo carácter visible (grafema, lo que separa Intl.Segmenter por defecto) que sea o
// contenga un pictograma o una bandera.
const PICTOGRAPH = new RegExp("\\p{Extended_Pictographic}|\\p{Regional_Indicator}", "u");
const graphemes = (text: string) => [...new Intl.Segmenter("es").segment(text)].length;

/** El emoji que escribió el admin; vacío es "•". */
export function parseEmoji(raw: string, locale: Locale = DEFAULT_LOCALE): Parsed<string> {
  const emoji = raw.trim();
  if (!emoji || emoji === DEFAULT_EMOJI) return { ok: true, value: DEFAULT_EMOJI };
  if (graphemes(emoji) !== 1 || !PICTOGRAPH.test(emoji)) return { ok: false, error: INPUT_TEXTS[locale].oneEmoji };
  return { ok: true, value: emoji };
}

export type CategoryChangeEntry = {
  action: "created" | "updated" | "archived" | "restored" | "deleted";
  type: CategoryType;
  name: string;
  emoji: string;
  details: CategoryChangeDetails;
  admin: { name: string } | null;
};

/**
 * El registro de un cambio como frase y su detalle: "Ana Admin archivó 🎮 Videojuegos (egresos)" (en
 * inglés, "Ana Admin archived 🎮 Videojuegos (expenses)": el nombre de la categoría va tal cual).
 */
export function changeSentence(change: CategoryChangeEntry, locale: Locale = DEFAULT_LOCALE): { text: string; detail: string | null } {
  return (locale === "es" ? spanishSentence : englishSentence)(change);
}

function spanishSentence(change: CategoryChangeEntry): { text: string; detail: string | null } {
  const admin = change.admin?.name ?? "Un admin";
  const label = `${change.emoji} ${change.name}`;
  const kind = CATEGORY_TYPE_LABELS[change.type].toLowerCase();
  const { previousName, previousEmoji, moved } = change.details;
  switch (change.action) {
    case "created":
      return { text: `${admin} creó ${label} (${kind})`, detail: null };
    case "updated":
      if (previousName && previousName !== change.name) {
        return { text: `${admin} renombró ${previousName} a ${label} (${kind})`, detail: null };
      }
      return { text: `${admin} cambió el emoji de ${change.name} (${kind}): ${previousEmoji ?? DEFAULT_EMOJI} → ${change.emoji}`, detail: null };
    case "archived":
      return { text: `${admin} archivó ${label} (${kind})`, detail: null };
    case "restored":
      return { text: `${admin} restauró ${label} (${kind})`, detail: null };
    case "deleted":
      return {
        text: `${admin} eliminó la categoría ${label} (${kind})`,
        detail: moved ? `${moved} ${moved === 1 ? "movimiento pasó" : "movimientos pasaron"} a ${DEFAULT_CATEGORY}` : null,
      };
  }
}

function englishSentence(change: CategoryChangeEntry): { text: string; detail: string | null } {
  const admin = change.admin?.name ?? "An admin";
  const label = `${change.emoji} ${change.name}`;
  const kind = CATEGORY_TYPE_TEXTS.en[change.type].toLowerCase();
  const { previousName, previousEmoji, moved } = change.details;
  switch (change.action) {
    case "created":
      return { text: `${admin} created ${label} (${kind})`, detail: null };
    case "updated":
      if (previousName && previousName !== change.name) {
        return { text: `${admin} renamed ${previousName} to ${label} (${kind})`, detail: null };
      }
      return { text: `${admin} changed the emoji of ${change.name} (${kind}): ${previousEmoji ?? DEFAULT_EMOJI} → ${change.emoji}`, detail: null };
    case "archived":
      return { text: `${admin} archived ${label} (${kind})`, detail: null };
    case "restored":
      return { text: `${admin} restored ${label} (${kind})`, detail: null };
    case "deleted":
      return {
        text: `${admin} deleted the category ${label} (${kind})`,
        detail: moved ? `${moved} ${moved === 1 ? "transaction" : "transactions"} moved to ${DEFAULT_CATEGORY}` : null,
      };
  }
}
