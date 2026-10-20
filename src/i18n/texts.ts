import type { Locale } from "./locales";

/** Los textos de una parte de la app, en cada idioma. */
export type Texts<T> = Readonly<Record<Locale, T>>;

/**
 * Los textos de una parte de la app: los del español, que manda, y los de los demás idiomas con sus mismas
 * claves (TypeScript avisa si a uno le falta o le sobra algo). Van junto a quien los usa; un texto con
 * datos es una función que los recibe. Se leen con `getTexts` (servidor) o `useTexts` (cliente).
 */
export function texts<T>(es: T, others: Omit<Texts<NoInfer<T>>, "es">): Texts<T> {
  return { es, ...others } as Texts<T>;
}
