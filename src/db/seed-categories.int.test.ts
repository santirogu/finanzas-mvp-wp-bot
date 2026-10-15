import { isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { category } from "@/db/schema";
import { createUser } from "../../test/integration/factories";
import { seedDefaultCategories } from "./seed-categories";

// La semilla corre en cada despliegue: solo debe crear las categorías por defecto en una base nueva,
// para no deshacer lo que el admin cambió en /admin/categorias.

const globalNames = () =>
  db.select({ type: category.type, name: category.name }).from(category).where(isNull(category.userId));

describe("seedDefaultCategories", () => {
  it("con las categorías ya creadas no hace nada", async () => {
    expect(await seedDefaultCategories(db)).toBe(0);
    expect(await globalNames()).toHaveLength(17);
  });

  it("no vuelve a crear las que el admin renombró o eliminó", async () => {
    await db.delete(category).where(isNull(category.userId));
    await db.insert(category).values([
      { type: "expense", name: "Supermercado", emoji: "🏪" },
      { type: "expense", name: "Otros", emoji: "📦" },
    ]);
    expect(await seedDefaultCategories(db)).toBe(0);
    expect((await globalNames()).map((c) => c.name).sort()).toEqual(["Otros", "Supermercado"]);
  });

  it("en una base sin categorías globales crea las 17 por defecto (las propias de una cuenta no cuentan)", async () => {
    await db.delete(category).where(isNull(category.userId));
    const ana = await createUser();
    await db.insert(category).values({ userId: ana.id, type: "expense", name: "Mía", emoji: "🙂" });
    expect(await seedDefaultCategories(db)).toBe(17);
    const names = await globalNames();
    expect(names.filter((c) => c.type === "expense")).toHaveLength(11);
    expect(names.filter((c) => c.type === "income")).toHaveLength(6);
    expect(names).toContainEqual({ type: "expense", name: "Otros" });
    expect(names).toContainEqual({ type: "income", name: "Otros" });
  });
});
