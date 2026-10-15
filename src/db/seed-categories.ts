// Las categorías globales por defecto, solo en una base sin ninguna (una instalación nueva). Corre en
// cada despliegue (scripts/seed.ts): si las creara siempre que faltan, volverían las que el admin
// renombró o eliminó en /admin/categorias. Una categoría nueva para todos se crea desde ahí.
import { count, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_CATEGORIES } from "../modules/transactions/default-categories";
import { category } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sirve con o sin el esquema tipado
type Database = PostgresJsDatabase<any>;

/** Crea las categorías por defecto si no hay ninguna global; devuelve cuántas creó. */
export async function seedDefaultCategories(db: Database): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(category).where(isNull(category.userId));
  if (total > 0) return 0;
  const rows = (["expense", "income"] as const).flatMap((type) =>
    DEFAULT_CATEGORIES[type].map(({ name, emoji }) => ({ type, name, emoji })),
  );
  const inserted = await db.insert(category).values(rows).onConflictDoNothing().returning({ id: category.id });
  return inserted.length;
}
