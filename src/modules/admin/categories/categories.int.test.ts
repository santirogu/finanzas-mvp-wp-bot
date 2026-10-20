import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { adminCodeUse, category, categoryChange, transaction, user } from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";
import { createAdminWithTwoFactor } from "../../../../test/integration/two-factor";

// Las categorías globales con la base de verdad: cada cambio, lo que queda en el registro y que los
// movimientos de todas las cuentas sigan bien. La sesión se simula: la del admin de cada prueba.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const {
  archiveCategory,
  categoriesSummary,
  createCategory,
  deleteCategory,
  listAdminCategories,
  listCategoryChanges,
  restoreCategory,
  updateCategory,
} = await import("./categories");

const NOW = new Date("2026-10-15T21:00:10Z");

async function adminReady() {
  const ready = await createAdminWithTwoFactor();
  auth.requireAdmin.mockResolvedValue({ id: ready.admin.id, role: "admin", twoFactorEnabled: true });
  return ready;
}

const globalByName = (type: "expense" | "income", name: string) =>
  db
    .select()
    .from(category)
    .where(and(eq(category.type, type), eq(category.name, name), isNull(category.userId)))
    .then((rows) => rows[0]);

async function addTransaction(userId: string, categoryId: string | null, overrides: Partial<typeof transaction.$inferInsert> = {}) {
  const [row] = await db
    .insert(transaction)
    .values({ userId, type: "expense", amount: 10_000, categoryId, description: "Algo", occurredOn: "2026-10-15", ...overrides })
    .returning();
  return row;
}

const changes = () =>
  db
    .select({ action: categoryChange.action, type: categoryChange.type, name: categoryChange.name, emoji: categoryChange.emoji, details: categoryChange.details })
    .from(categoryChange);

beforeEach(() => {
  auth.requireAdmin.mockReset();
});

describe("listAdminCategories y categoriesSummary", () => {
  it("las globales de los dos tipos, alfabéticas con Otros al final, con cuántos movimientos (de todas las cuentas) usa cada una", async () => {
    await adminReady();
    const ana = await createUser();
    const beto = await createUser();
    const mercado = await globalByName("expense", "Mercado");
    await addTransaction(ana.id, mercado.id);
    await addTransaction(beto.id, mercado.id);
    // Uno eliminado no cuenta.
    await addTransaction(beto.id, mercado.id, { deletedAt: new Date() });
    // Las categorías propias de una cuenta no son de la administración.
    await db.insert(category).values({ userId: ana.id, type: "expense", name: "Mía", emoji: "🙂" });

    const list = await listAdminCategories();
    const expenses = list.filter((c) => c.type === "expense");
    expect(expenses.map((c) => c.name)).toEqual([
      "Alimentación",
      "Deudas",
      "Educación",
      "Entretenimiento",
      "Mercado",
      "Ropa",
      "Salud",
      "Servicios",
      "Transporte",
      "Vivienda",
      "Otros",
    ]);
    expect(list.filter((c) => c.type === "income").map((c) => c.name).at(-1)).toBe("Otros");
    expect(expenses.find((c) => c.name === "Mercado")).toEqual({
      id: mercado.id,
      type: "expense",
      name: "Mercado",
      emoji: "🛒",
      archived: false,
      movements: 2,
      isDefault: false,
    });
    expect(expenses.find((c) => c.name === "Otros")).toMatchObject({ isDefault: true, movements: 0 });
    expect(list.some((c) => c.name === "Mía")).toBe(false);
    expect(await categoriesSummary()).toEqual({ expense: 11, income: 6 });
  });

  it("el resumen cuenta 0 si un tipo no tiene ninguna activa", async () => {
    await adminReady();
    await db.update(category).set({ archivedAt: NOW }).where(and(eq(category.type, "income"), isNull(category.userId)));
    expect(await categoriesSummary()).toEqual({ expense: 11, income: 0 });
  });
});

describe("createCategory", () => {
  it("crea la categoría y lo registra con el admin", async () => {
    const { admin } = await adminReady();
    expect(await createCategory({ type: "expense", name: "  Café ", emoji: "☕" })).toEqual({ ok: true, message: "Se creó la categoría ☕ Café." });
    expect(await globalByName("expense", "Café")).toMatchObject({ emoji: "☕", archivedAt: null });
    expect(await changes()).toEqual([{ action: "created", type: "expense", name: "Café", emoji: "☕", details: {} }]);
    const [log] = await db.select({ adminId: categoryChange.adminId, categoryId: categoryChange.categoryId }).from(categoryChange);
    expect(log).toEqual({ adminId: admin.id, categoryId: (await globalByName("expense", "Café")).id });
    expect(await categoriesSummary()).toEqual({ expense: 12, income: 6 });
  });

  it("sin emoji usa •; cualquier tipo raro se toma como egreso", async () => {
    await adminReady();
    await createCategory({ type: "otra-cosa", name: "Varios", emoji: "" });
    expect(await globalByName("expense", "Varios")).toMatchObject({ emoji: "•" });
    await createCategory({ type: "income", name: "Bonos", emoji: "" });
    expect(await globalByName("income", "Bonos")).toBeDefined();
  });

  it.each(["mercado", "MERCADO", " Mércado ", "otros"])("no repite nombres del mismo tipo (%j), sin importar mayúsculas ni tildes", async (name) => {
    await adminReady();
    expect(await createCategory({ type: "expense", name, emoji: "🛒" })).toEqual({
      ok: false,
      error: "Ya hay una categoría de egresos con ese nombre.",
      field: "name",
    });
    expect(await changes()).toEqual([]);
  });

  it("tampoco el de una archivada; pero sí el de otro tipo", async () => {
    await adminReady();
    await db.update(category).set({ archivedAt: NOW }).where(eq(category.id, (await globalByName("expense", "Ropa")).id));
    expect(await createCategory({ type: "expense", name: "Ropa", emoji: "👕" })).toMatchObject({ ok: false, field: "name" });
    expect(await createCategory({ type: "income", name: "Mercado", emoji: "🛒" })).toMatchObject({ ok: true });
  });

  it("valida el nombre y el emoji", async () => {
    await adminReady();
    expect(await createCategory({ type: "expense", name: " ", emoji: "☕" })).toEqual({ ok: false, error: "Escribe un nombre.", field: "name" });
    expect(await createCategory({ type: "expense", name: "Café", emoji: "cafe" })).toEqual({ ok: false, error: "Escribe un solo emoji.", field: "emoji" });
    expect(await changes()).toEqual([]);
  });
});

describe("updateCategory", () => {
  it("cambia nombre y emoji; los movimientos que la usan siguen con ella y lo registra con lo de antes", async () => {
    await adminReady();
    const ana = await createUser();
    const mercado = await globalByName("expense", "Mercado");
    const tx = await addTransaction(ana.id, mercado.id);
    expect(await updateCategory({ id: mercado.id, name: "Supermercado", emoji: "🏪" })).toEqual({
      ok: true,
      message: "Se guardó la categoría 🏪 Supermercado.",
    });
    expect(await globalByName("expense", "Supermercado")).toMatchObject({ id: mercado.id, emoji: "🏪" });
    expect((await db.select().from(transaction).where(eq(transaction.id, tx.id)))[0].categoryId).toBe(mercado.id);
    expect(await changes()).toEqual([
      { action: "updated", type: "expense", name: "Supermercado", emoji: "🏪", details: { previousName: "Mercado", previousEmoji: "🛒" } },
    ]);
  });

  it("a Otros solo se le cambia el emoji", async () => {
    await adminReady();
    const otros = await globalByName("expense", "Otros");
    expect(otros.emoji).not.toBe("🧩");
    expect(await updateCategory({ id: otros.id, name: "Varios", emoji: "🧩" })).toEqual({
      ok: false,
      error: 'A "Otros" solo se le puede cambiar el emoji.',
      field: "name",
    });
    // Ni el nombre ni el emoji: con el error no se guarda nada ni se registra.
    expect(await globalByName("expense", "Otros")).toMatchObject({ id: otros.id, emoji: otros.emoji });
    expect(await changes()).toEqual([]);
    expect(await updateCategory({ id: otros.id, name: "Otros", emoji: "🗃️" })).toMatchObject({ ok: true });
    expect(await globalByName("expense", "Otros")).toMatchObject({ emoji: "🗃️" });
  });

  it("no puede quedar con el nombre de otra (pero sí cambiar mayúsculas de la suya)", async () => {
    await adminReady();
    const mercado = await globalByName("expense", "Mercado");
    expect(await updateCategory({ id: mercado.id, name: "salud", emoji: "🧺" })).toMatchObject({ ok: false, field: "name" });
    expect(await updateCategory({ id: mercado.id, name: "Otros", emoji: "🧺" })).toMatchObject({ ok: false, field: "name" });
    // Las dos quedaron como estaban (tampoco el emoji nuevo) y no se registró nada.
    expect(await globalByName("expense", "Mercado")).toMatchObject({ id: mercado.id, emoji: mercado.emoji });
    expect(await globalByName("expense", "Salud")).toBeTruthy();
    expect(await changes()).toEqual([]);
    expect(await updateCategory({ id: mercado.id, name: "MERCADO", emoji: "🛒" })).toMatchObject({ ok: true });
  });

  it("valida el nombre y el emoji al editar", async () => {
    await adminReady();
    const mercado = await globalByName("expense", "Mercado");
    expect(await updateCategory({ id: mercado.id, name: "", emoji: "🛒" })).toEqual({ ok: false, error: "Escribe un nombre.", field: "name" });
    expect(await updateCategory({ id: mercado.id, name: "Mercado", emoji: "xx" })).toEqual({ ok: false, error: "Escribe un solo emoji.", field: "emoji" });
    expect(await changes()).toEqual([]);
  });

  it("sin cambios no registra nada", async () => {
    await adminReady();
    const mercado = await globalByName("expense", "Mercado");
    expect(await updateCategory({ id: mercado.id, name: " Mercado ", emoji: "🛒" })).toEqual({ ok: true, message: "No había nada que cambiar." });
    expect(await changes()).toEqual([]);
  });

  it.each(["no-existe", "00000000-0000-0000-0000-000000000000", ""])("con el id %j: no existe", async (id) => {
    await adminReady();
    expect(await updateCategory({ id, name: "X", emoji: "🛒" })).toEqual({ ok: false, error: "Esta categoría ya no existe." });
  });

  it("no toca las categorías propias de una cuenta", async () => {
    await adminReady();
    const ana = await createUser();
    const [mine] = await db.insert(category).values({ userId: ana.id, type: "expense", name: "Mía", emoji: "🙂" }).returning();
    expect(await updateCategory({ id: mine.id, name: "Cambiada", emoji: "😎" })).toEqual({ ok: false, error: "Esta categoría ya no existe." });
    expect(await db.select().from(category).where(eq(category.id, mine.id))).toEqual([mine]);
    expect(await changes()).toEqual([]);
  });
});

describe("archiveCategory y restoreCategory", () => {
  it("archivar pide el código, la marca y lo registra; los movimientos la conservan; restaurar la devuelve sin código", async () => {
    const { codeAt } = await adminReady();
    const ana = await createUser();
    const ropa = await globalByName("expense", "Ropa");
    const tx = await addTransaction(ana.id, ropa.id);

    expect(await archiveCategory({ id: ropa.id, code: codeAt(NOW) }, NOW)).toEqual({ ok: true, message: "Se archivó la categoría 👟 Ropa." });
    expect(await globalByName("expense", "Ropa")).toMatchObject({ archivedAt: NOW });
    expect((await db.select().from(transaction).where(eq(transaction.id, tx.id)))[0].categoryId).toBe(ropa.id);
    expect((await listAdminCategories()).find((c) => c.id === ropa.id)).toMatchObject({ archived: true, movements: 1 });
    expect(await categoriesSummary()).toEqual({ expense: 10, income: 6 });

    expect(await archiveCategory({ id: ropa.id, code: codeAt(new Date(NOW.getTime() + 30_000)) }, NOW)).toEqual({
      ok: false,
      error: "La categoría ya está archivada.",
    });
    expect(await restoreCategory({ id: ropa.id })).toEqual({ ok: true, message: "Se restauró la categoría 👟 Ropa." });
    expect(await globalByName("expense", "Ropa")).toMatchObject({ archivedAt: null });
    expect(await restoreCategory({ id: ropa.id })).toEqual({ ok: false, error: "La categoría no está archivada." });
    expect((await changes()).map((c) => c.action)).toEqual(["archived", "restored"]);
  });

  it("con un código equivocado no archiva", async () => {
    await adminReady();
    const ropa = await globalByName("expense", "Ropa");
    expect(await archiveCategory({ id: ropa.id, code: "000000" }, NOW)).toMatchObject({ ok: false, field: "code" });
    expect(await globalByName("expense", "Ropa")).toMatchObject({ archivedAt: null });
    expect(await changes()).toEqual([]);
  });

  it("Otros no se archiva (sin gastar el código)", async () => {
    const { codeAt } = await adminReady();
    const otros = await globalByName("income", "Otros");
    expect(await archiveCategory({ id: otros.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: '"Otros" no se puede archivar: es la categoría por defecto.',
    });
    expect(await db.$count(adminCodeUse)).toBe(0);
  });
});

describe("deleteCategory", () => {
  it("sin movimientos: la borra y lo registra", async () => {
    const { codeAt } = await adminReady();
    await createCategory({ type: "expense", name: "Por error", emoji: "❌" });
    const wrong = await globalByName("expense", "Por error");
    expect(await deleteCategory({ id: wrong.id, code: codeAt(NOW) }, NOW)).toEqual({ ok: true, message: "Se eliminó la categoría ❌ Por error." });
    expect(await globalByName("expense", "Por error")).toBeUndefined();
    expect((await changes()).at(-1)).toEqual({ action: "deleted", type: "expense", name: "Por error", emoji: "❌", details: {} });
  });

  it("con movimientos de varias cuentas: pasan a Otros de su tipo (también los eliminados), en la misma operación", async () => {
    const { codeAt } = await adminReady();
    const ana = await createUser();
    const beto = await createUser();
    const ropa = await globalByName("expense", "Ropa");
    const otros = await globalByName("expense", "Otros");
    const salario = await globalByName("income", "Salario");
    const t1 = await addTransaction(ana.id, ropa.id);
    const t2 = await addTransaction(beto.id, ropa.id);
    const t3 = await addTransaction(beto.id, ropa.id, { deletedAt: new Date() });
    const other = await addTransaction(ana.id, salario.id, { type: "income" });

    expect(await deleteCategory({ id: ropa.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se eliminó la categoría 👟 Ropa; 2 movimientos pasaron a Otros.",
    });
    const rows = await db.select({ id: transaction.id, categoryId: transaction.categoryId }).from(transaction);
    const categoryOf = (id: string) => rows.find((r) => r.id === id)!.categoryId;
    expect([categoryOf(t1.id), categoryOf(t2.id), categoryOf(t3.id)]).toEqual([otros.id, otros.id, otros.id]);
    expect(categoryOf(other.id)).toBe(salario.id);
    expect(await globalByName("expense", "Ropa")).toBeUndefined();
    expect((await changes()).at(-1)).toEqual({ action: "deleted", type: "expense", name: "Ropa", emoji: "👟", details: { moved: 2 } });
    // Los registros viejos de esa categoría quedan, sin el enlace.
    expect((await db.select({ categoryId: categoryChange.categoryId }).from(categoryChange)).every((c) => c.categoryId === null)).toBe(true);
  });

  it("con un solo movimiento lo dice en singular; también se puede eliminar una archivada", async () => {
    const { codeAt } = await adminReady();
    const ana = await createUser();
    const ropa = await globalByName("expense", "Ropa");
    await addTransaction(ana.id, ropa.id);
    await db.update(category).set({ archivedAt: NOW }).where(eq(category.id, ropa.id));
    expect(await deleteCategory({ id: ropa.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se eliminó la categoría 👟 Ropa; 1 movimiento pasó a Otros.",
    });
  });

  it("con un código equivocado no borra ni mueve nada", async () => {
    await adminReady();
    const ana = await createUser();
    const ropa = await globalByName("expense", "Ropa");
    const tx = await addTransaction(ana.id, ropa.id);
    expect(await deleteCategory({ id: ropa.id, code: "000000" }, NOW)).toMatchObject({ ok: false, field: "code" });
    expect(await globalByName("expense", "Ropa")).toBeDefined();
    expect((await db.select().from(transaction).where(eq(transaction.id, tx.id)))[0].categoryId).toBe(ropa.id);
    expect(await changes()).toEqual([]);
  });

  it("Otros no se elimina; y si faltara, no se elimina ninguna (sin gastar el código)", async () => {
    const { codeAt } = await adminReady();
    const otros = await globalByName("expense", "Otros");
    expect(await deleteCategory({ id: otros.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: '"Otros" no se puede eliminar: es la categoría por defecto.',
    });
    await db.delete(category).where(eq(category.id, otros.id));
    const ropa = await globalByName("expense", "Ropa");
    expect(await deleteCategory({ id: ropa.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: 'Falta la categoría "Otros": créala antes de eliminar otra.',
    });
    expect(await db.$count(adminCodeUse)).toBe(0);
  });
});

describe("listCategoryChanges", () => {
  it("del más nuevo al más viejo, con el nombre del admin (o sin él si su cuenta ya no existe)", async () => {
    const { admin, codeAt } = await adminReady();
    await createCategory({ type: "expense", name: "Café", emoji: "☕" });
    const cafe = await globalByName("expense", "Café");
    await archiveCategory({ id: cafe.id, code: codeAt(NOW) }, NOW);
    const list = await listCategoryChanges();
    expect(list.map((c) => [c.action, c.name, c.admin?.name])).toEqual([
      ["archived", "Café", "Ana Admin"],
      ["created", "Café", "Ana Admin"],
    ]);
    await db.delete(user).where(eq(user.id, admin.id));
    expect((await listCategoryChanges()).every((c) => c.admin === null)).toBe(true);
  });

  it("muestra los últimos 20", async () => {
    await adminReady();
    for (let i = 0; i < 22; i++) await createCategory({ type: "expense", name: `Cat ${String(i).padStart(2, "0")}`, emoji: "" });
    const list = await listCategoryChanges();
    expect(list).toHaveLength(20);
    expect(list[0].name).toBe("Cat 21");
  });
});

describe("sin admin no hay nada", () => {
  it.each([
    ["sin sesión", new Error("NEXT_REDIRECT:/login")],
    ["un usuario", new Error("NEXT_NOT_FOUND")],
    ["un admin sin verificación", new Error("NEXT_REDIRECT:/admin/seguridad")],
  ])("%s: todas fallan antes de tocar la base", async (_, error) => {
    const mercado = await globalByName("expense", "Mercado");
    auth.requireAdmin.mockRejectedValue(error);
    const calls = [
      listAdminCategories(),
      categoriesSummary(),
      listCategoryChanges(),
      createCategory({ type: "expense", name: "Intrusa", emoji: "" }),
      updateCategory({ id: mercado.id, name: "Intrusa", emoji: "" }),
      archiveCategory({ id: mercado.id, code: "123456" }),
      restoreCategory({ id: mercado.id }),
      deleteCategory({ id: mercado.id, code: "123456" }),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(error.message);
    expect(await globalByName("expense", "Mercado")).toMatchObject({ archivedAt: null });
    expect(await globalByName("expense", "Intrusa")).toBeUndefined();
    expect(await changes()).toEqual([]);
  });
});
