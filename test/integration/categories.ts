// Las categorías globales vuelven a ser las de por defecto (activas, con su emoji y sin nombre en inglés)
// antes de cada prueba: las de /admin/categorias las crean, renombran, archivan y eliminan.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category } from "@/db/schema";
import { DEFAULT_CATEGORIES } from "@/modules/transactions/default-categories";

const defaults = (["expense", "income"] as const).flatMap((type) =>
  DEFAULT_CATEGORIES[type].map(({ name, emoji }) => ({ type, name, emoji })),
);

export async function resetGlobalCategories() {
  const rows = await db.select().from(category).where(isNull(category.userId));
  for (const row of rows) {
    const original = defaults.find((d) => d.type === row.type && d.name === row.name);
    if (!original) await db.delete(category).where(eq(category.id, row.id));
    else if (row.archivedAt || row.emoji !== original.emoji || row.nameEn !== null) {
      await db.update(category).set({ archivedAt: null, emoji: original.emoji, nameEn: null }).where(and(eq(category.id, row.id)));
    }
  }
  await db.insert(category).values(defaults).onConflictDoNothing();
}
