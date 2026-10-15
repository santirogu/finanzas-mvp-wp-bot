import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import { monthRange } from "@/lib/dates";
import { createUser } from "../../../test/integration/factories";
import {
  getCategoryOption,
  getMonthlySummary,
  getTotalsByCategory,
  getTransaction,
  isCategoryAvailable,
  listCategories,
  listTransactions,
} from "./queries";

const october = monthRange(2026, 10);

type NewTx = Partial<typeof transaction.$inferInsert> & { userId: string };
const addTx = (tx: NewTx) =>
  db
    .insert(transaction)
    .values({
      type: "expense",
      amount: 10000,
      description: "Movimiento",
      occurredOn: "2026-10-15",
      ...tx,
    })
    .returning()
    .then((rows) => rows[0]);

const globalCategory = async (type: "income" | "expense", name: string) =>
  (await listCategories("nadie", type)).find((c) => c.name === name)!;

describe("getMonthlySummary", () => {
  it("suma ingresos y egresos del mes y calcula el balance", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, type: "income", amount: 3200000 });
    await addTx({ userId: user.id, type: "expense", amount: 500000 });
    await addTx({ userId: user.id, type: "expense", amount: 250000 });

    expect(await getMonthlySummary(user.id, october)).toEqual({
      income: 3200000,
      expense: 750000,
      balance: 2450000,
      count: 3,
    });
  });

  it("incluye el primer y último día del mes, y excluye los meses vecinos", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, occurredOn: "2026-09-30", amount: 1 });
    await addTx({ userId: user.id, occurredOn: "2026-10-01", amount: 100 });
    await addTx({ userId: user.id, occurredOn: "2026-10-31", amount: 200 });
    await addTx({ userId: user.id, occurredOn: "2026-11-01", amount: 1 });

    expect(await getMonthlySummary(user.id, october)).toMatchObject({ expense: 300, count: 2 });
  });

  it("ignora movimientos eliminados y de otros usuarios", async () => {
    const user = await createUser();
    const other = await createUser();
    await addTx({ userId: user.id, amount: 100 });
    await addTx({ userId: user.id, amount: 999, deletedAt: new Date() });
    await addTx({ userId: other.id, amount: 5000 });

    expect(await getMonthlySummary(user.id, october)).toMatchObject({ expense: 100, count: 1 });
  });

  it("devuelve ceros cuando no hay movimientos", async () => {
    const user = await createUser();
    expect(await getMonthlySummary(user.id, october)).toEqual({
      income: 0,
      expense: 0,
      balance: 0,
      count: 0,
    });
  });

  it("maneja montos grandes sin perder precisión", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, type: "income", amount: 9_000_000_000_000 });
    await addTx({ userId: user.id, type: "income", amount: 1 });

    expect((await getMonthlySummary(user.id, october)).income).toBe(9_000_000_000_001);
  });
});

describe("getTotalsByCategory", () => {
  it("agrupa egresos por categoría, de mayor a menor, con 'Sin categoría'", async () => {
    const user = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    const mercado = await globalCategory("expense", "Mercado");
    await addTx({ userId: user.id, categoryId: ropa.id, amount: 500000 });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 100000 });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 80000 });
    await addTx({ userId: user.id, categoryId: null, amount: 30000 });
    await addTx({ userId: user.id, type: "income", amount: 9999999 });

    expect(await getTotalsByCategory(user.id, "expense", october)).toEqual([
      { name: "Ropa", emoji: "👟", total: 500000 },
      { name: "Mercado", emoji: "🛒", total: 180000 },
      { name: "Sin categoría", emoji: "•", total: 30000 },
    ]);
  });
});

describe("aislamiento entre usuarios", () => {
  it("las listas y los totales por categoría nunca incluyen movimientos de otro usuario", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    await addTx({ userId: ana.id, categoryId: ropa.id, amount: 100000, description: "De Ana" });
    await addTx({ userId: beto.id, categoryId: ropa.id, amount: 900000, description: "De Beto" });
    await addTx({ userId: beto.id, type: "income", amount: 5000000, description: "Ingreso de Beto" });

    expect((await listTransactions(ana.id, october)).map((t) => t.description)).toEqual(["De Ana"]);
    expect(
      (await listTransactions(ana.id, october, { type: "income" })).map((t) => t.description),
    ).toEqual([]);
    expect(await getTotalsByCategory(ana.id, "expense", october)).toEqual([
      { name: "Ropa", emoji: "👟", total: 100000 },
    ]);
    expect(await getTotalsByCategory(ana.id, "income", october)).toEqual([]);
  });

  it("un usuario sin movimientos no ve nada aunque otros sí tengan", async () => {
    const vacio = await createUser();
    const otro = await createUser();
    await addTx({ userId: otro.id });

    expect(await listTransactions(vacio.id, october)).toEqual([]);
    expect(await getTotalsByCategory(vacio.id, "expense", october)).toEqual([]);
    expect(await getMonthlySummary(vacio.id, october)).toEqual({
      income: 0,
      expense: 0,
      balance: 0,
      count: 0,
    });
  });
});

describe("getTransaction", () => {
  it("devuelve un movimiento propio con lo necesario para editarlo", async () => {
    const user = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    const tx = await addTx({ userId: user.id, categoryId: ropa.id, amount: 500000, description: "Zapatos" });

    expect(await getTransaction(user.id, tx.id)).toEqual({
      id: tx.id,
      type: "expense",
      amount: 500000,
      description: "Zapatos",
      categoryId: ropa.id,
      occurredOn: "2026-10-15",
      source: "web",
    });
  });

  it("no devuelve movimientos de otro usuario ni eliminados", async () => {
    const owner = await createUser();
    const other = await createUser();
    const tx = await addTx({ userId: owner.id });
    const deleted = await addTx({ userId: owner.id, deletedAt: new Date() });

    expect(await getTransaction(other.id, tx.id)).toBeNull();
    expect(await getTransaction(owner.id, deleted.id)).toBeNull();
  });
});

describe("listTransactions", () => {
  it("filtra por tipo y ordena del más reciente al más antiguo", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, description: "Viejo", occurredOn: "2026-10-02" });
    await addTx({ userId: user.id, description: "Nuevo", occurredOn: "2026-10-20" });
    await addTx({ userId: user.id, description: "Ingreso", type: "income" });

    const expenses = await listTransactions(user.id, october, { type: "expense" });
    expect(expenses.map((t) => t.description)).toEqual(["Nuevo", "Viejo"]);

    const all = await listTransactions(user.id, october);
    expect(all).toHaveLength(3);
  });

  it("respeta el límite e incluye la categoría", async () => {
    const user = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    for (let i = 0; i < 5; i++) await addTx({ userId: user.id, categoryId: ropa.id });

    const rows = await listTransactions(user.id, october, { limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ categoryName: "Ropa", categoryEmoji: "👟" });
  });
});

describe("categorías", () => {
  it("lista las globales y las propias, nunca las de otro usuario", async () => {
    const user = await createUser();
    const other = await createUser();
    await db.insert(category).values([
      { userId: user.id, type: "expense", name: "Mascotas", emoji: "🐶" },
      { userId: other.id, type: "expense", name: "Secreta", emoji: "🔒" },
    ]);

    const names = (await listCategories(user.id, "expense")).map((c) => c.name);
    expect(names).toContain("Ropa");
    expect(names).toContain("Mascotas");
    expect(names).not.toContain("Secreta");
    expect(names).not.toContain("Salario");
  });

  it("isCategoryAvailable rechaza categorías de otro tipo o de otro usuario", async () => {
    const user = await createUser();
    const other = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    const [secret] = await db
      .insert(category)
      .values({ userId: other.id, type: "expense", name: "Secreta" })
      .returning();

    expect(await isCategoryAvailable(user.id, ropa.id, "expense")).toBe(true);
    expect(await isCategoryAvailable(user.id, ropa.id, "income")).toBe(false);
    expect(await isCategoryAvailable(user.id, secret.id, "expense")).toBe(false);
  });

  it("las archivadas no se listan; el orden es alfabético con Otros al final", async () => {
    const user = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, ropa.id));
    const names = (await listCategories(user.id, "expense")).map((c) => c.name);
    expect(names).not.toContain("Ropa");
    expect(names.at(-1)).toBe("Otros");
    expect(names[0]).toBe("Alimentación");
  });

  it("una archivada no se puede usar en un movimiento nuevo, pero sí conservar la que ya tenía uno propio", async () => {
    const user = await createUser();
    const other = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    const salud = await globalCategory("expense", "Salud");
    const mine = await addTx({ userId: user.id, categoryId: ropa.id });
    const withSalud = await addTx({ userId: user.id, categoryId: salud.id });
    const theirs = await addTx({ userId: other.id, categoryId: ropa.id });
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, ropa.id));

    expect(await isCategoryAvailable(user.id, ropa.id, "expense")).toBe(false);
    expect(await isCategoryAvailable(user.id, ropa.id, "expense", { keepFrom: mine.id })).toBe(true);
    // No sirve para pasar otro movimiento a la archivada, ni usar el de otra cuenta como excusa.
    expect(await isCategoryAvailable(user.id, ropa.id, "expense", { keepFrom: withSalud.id })).toBe(false);
    expect(await isCategoryAvailable(user.id, ropa.id, "expense", { keepFrom: theirs.id })).toBe(false);
    // Las activas, siempre.
    expect(await isCategoryAvailable(user.id, salud.id, "expense", { keepFrom: mine.id })).toBe(true);
  });

  it("getCategoryOption trae la de un movimiento aunque esté archivada (marcada), y nunca una ajena", async () => {
    const user = await createUser();
    const other = await createUser();
    const ropa = await globalCategory("expense", "Ropa");
    const [secret] = await db.insert(category).values({ userId: other.id, type: "expense", name: "Secreta" }).returning();
    expect(await getCategoryOption(user.id, ropa.id)).toEqual({ id: ropa.id, name: "Ropa", emoji: "👟", archived: false });
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, ropa.id));
    expect(await getCategoryOption(user.id, ropa.id)).toMatchObject({ archived: true });
    expect(await getCategoryOption(user.id, secret.id)).toBeNull();
    expect(await getCategoryOption(user.id, null)).toBeNull();
  });
});
