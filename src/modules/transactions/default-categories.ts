// Categorías globales por defecto (las crea el seed en una base nueva; después las administra el admin
// en /admin/categorias), y lo común a todas: "Otros", cómo se comparan los nombres y el orden.
export const DEFAULT_CATEGORIES = {
  expense: [
    { name: "Alimentación", emoji: "🍽️" },
    { name: "Mercado", emoji: "🛒" },
    { name: "Transporte", emoji: "🚌" },
    { name: "Vivienda", emoji: "🏠" },
    { name: "Servicios", emoji: "💡" },
    { name: "Salud", emoji: "🩺" },
    { name: "Ropa", emoji: "👟" },
    { name: "Entretenimiento", emoji: "🎬" },
    { name: "Educación", emoji: "📚" },
    { name: "Deudas", emoji: "💳" },
    { name: "Otros", emoji: "📦" },
  ],
  income: [
    { name: "Salario", emoji: "💼" },
    { name: "Freelance", emoji: "💻" },
    { name: "Ventas", emoji: "🏷️" },
    { name: "Inversiones", emoji: "📈" },
    { name: "Regalos", emoji: "🎁" },
    { name: "Otros", emoji: "📦" },
  ],
} as const;

/** La categoría por defecto de cada tipo: la que usa el bot si ninguna encaja. Solo se le cambia el emoji. */
export const DEFAULT_CATEGORY = "Otros";

/** Un nombre para comparar: sin mayúsculas, tildes ni espacios de más ("Mércado " = "mercado"). */
export function foldName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** ¿Es "Otros", la categoría por defecto? */
export const isDefaultCategory = (name: string) => foldName(name) === foldName(DEFAULT_CATEGORY);

/**
 * Alfabético (sin importar tildes ni mayúsculas), con "Otros" siempre al final. `label`: el nombre a la vista
 * (en inglés, el de `name_en`), por el que se ordena; "Otros" se reconoce siempre por `name`.
 */
export function sortCategories<T extends { name: string }>(categories: readonly T[], label: (category: T) => string = (c) => c.name): T[] {
  return [...categories].sort((a, b) => {
    const byDefault = Number(isDefaultCategory(a.name)) - Number(isDefaultCategory(b.name));
    return byDefault || label(a).localeCompare(label(b), "es", { sensitivity: "base" });
  });
}
