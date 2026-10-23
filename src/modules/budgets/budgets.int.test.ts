import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { appValues, category, categoryBudget, transaction } from "@/db/schema";
import { monthRange } from "@/lib/dates";
import type { CurrentUser } from "@/lib/session";
import { listCategories } from "@/modules/transactions/queries";
import { createUser } from "../../../test/integration/factories";
import { requestLocale } from "../../../test/integration/locale";

// Los presupuestos de cada persona: ponerlos, cambiarlos y quitarlos (solo los propios, de categorías de egresos que
// puede ver), lo que lleva cada categoría en el mes y sus Server Actions, contra la base de pruebas, con dos
// usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getBudgetCrossings, getBudgetProgress, getSpentByCategory, listBudgetCategories, listBudgets, removeBudget, saveBudget } = await import("./budgets");
const { removeBudgetAction, saveBudgetAction } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function signIn() {
  const user = await createUser();
  session.current = { ...user, role: user.role, superAdmin: user.superAdmin, twoFactorEnabled: user.twoFactorEnabled };
  return user;
}

beforeEach(() => {
  session.current = null;
  vi.mocked(refresh).mockClear();
});

const october = monthRange(2026, 10);
const globalCategory = async (name: string, type: "income" | "expense" = "expense") =>
  (await listCategories("nadie", type)).find((c) => c.name === name)!;
const cop = (id: string) => ({ id, currency: "COP" });

describe("saveBudget, listBudgets y removeBudget", () => {
  it("pone, cambia y quita los presupuestos propios; los de otra cuenta no se ven ni se tocan", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const mercado = await globalCategory("Mercado");

    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "500.000" })).toEqual({
      ok: true,
      message: "Se guardó el presupuesto de Mercado: $500.000,00 al mes",
      tone: "success",
    });
    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "650.000,50" })).toMatchObject({
      ok: true,
      message: "Se cambió el presupuesto de Mercado: $650.000,50 al mes",
    });
    expect(await listBudgets(ana.id)).toEqual([{ categoryId: mercado.id, name: "Mercado", emoji: mercado.emoji, amount: 650000.5, archived: false }]);
    expect(await listBudgets(beto.id)).toEqual([]);

    // Beto no puede quitar el de Ana.
    expect(await removeBudget(beto.id, { categoryId: mercado.id })).toEqual({ ok: false, error: "Ese presupuesto ya no existe." });
    expect(await listBudgets(ana.id)).toHaveLength(1);

    expect(await removeBudget(ana.id, { categoryId: mercado.id })).toEqual({ ok: true, message: "Se quitó el presupuesto de Mercado", tone: "removal" });
    expect(await listBudgets(ana.id)).toEqual([]);
    expect(await removeBudget(ana.id, { categoryId: mercado.id })).toMatchObject({ ok: false });
    expect(await removeBudget(ana.id, { categoryId: "no-es-un-id" })).toMatchObject({ ok: false });
  });

  it("solo con una categoría de egresos que la persona puede ver, y un monto válido", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const sueldo = await globalCategory("Salario", "income");
    const [deBeto] = await db.insert(category).values({ userId: beto.id, type: "expense", name: `De Beto ${beto.id}` }).returning();
    const mercado = await globalCategory("Mercado");
    const categoryError = { ok: false, error: "Elige una categoría.", field: "categoryId" };

    expect(await saveBudget(cop(ana.id), { categoryId: "no-es-un-id", amount: "1000" })).toEqual(categoryError);
    expect(await saveBudget(cop(ana.id), { categoryId: null, amount: "1000" })).toEqual(categoryError);
    expect(await saveBudget(cop(ana.id), { categoryId: sueldo.id, amount: "1000" })).toEqual(categoryError);
    expect(await saveBudget(cop(ana.id), { categoryId: deBeto.id, amount: "1000" })).toEqual(categoryError);
    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "" })).toEqual({
      ok: false,
      error: "Escribe un monto mayor que cero.",
      field: "amount",
    });
    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "0" })).toMatchObject({ ok: false, field: "amount" });
    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "999.999.999.999.999" })).toMatchObject({ ok: false, field: "amount" });
    expect(await listBudgets(ana.id)).toEqual([]);
  });

  it("una categoría archivada: uno nuevo no, pero el que ya tenía se puede cambiar; si el admin la elimina, el presupuesto se va", async () => {
    const ana = await createUser();
    const [viajes] = await db.insert(category).values({ type: "expense", name: `Viajes ${ana.id}`, emoji: "✈️" }).returning();
    const [ropa] = await db.insert(category).values({ type: "expense", name: `Ropa ${ana.id}`, emoji: "👕" }).returning();
    expect(await saveBudget(cop(ana.id), { categoryId: viajes.id, amount: "100000" })).toMatchObject({ ok: true });

    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, viajes.id));
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, ropa.id));
    expect(await saveBudget(cop(ana.id), { categoryId: ropa.id, amount: "100000" })).toMatchObject({ ok: false, field: "categoryId" });
    expect(await saveBudget(cop(ana.id), { categoryId: viajes.id, amount: "200000" })).toMatchObject({ ok: true });
    expect((await listBudgets(ana.id))[0]).toMatchObject({ categoryId: viajes.id, amount: 200000, archived: true });
    // Una archivada ya no se ofrece para uno nuevo.
    expect((await listBudgetCategories(ana.id)).map((c) => c.id)).not.toContain(ropa.id);

    await db.delete(category).where(eq(category.id, viajes.id));
    expect(await listBudgets(ana.id)).toEqual([]);
  });

  it("en inglés: el monto con sus separadores y los mensajes", async () => {
    const ana = await createUser();
    const mercado = await globalCategory("Mercado");
    expect(await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "1,250.50" }, "en")).toMatchObject({
      ok: true,
      message: expect.stringMatching(/^The .+ budget was saved: \$1,250\.50 a month$/),
    });
    expect(await saveBudget(cop(ana.id), { categoryId: "x", amount: "1" }, "en")).toMatchObject({ error: "Choose a category." });
  });
});

describe("getSpentByCategory, getBudgetProgress y listBudgetCategories", () => {
  it("lo gastado en el mes por categoría: solo egresos propios, sin borrados, sin otros meses ni movimientos sin categoría", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const mercado = await globalCategory("Mercado");
    const restaurantes = await globalCategory("Alimentación");
    const salario = await globalCategory("Salario", "income");
    const add = (userId: string, values: Partial<typeof transaction.$inferInsert>) =>
      db.insert(transaction).values({ userId, type: "expense", amount: 1, description: "x", occurredOn: "2026-10-10", ...values });
    await add(ana.id, { amount: 300000, categoryId: mercado.id });
    await add(ana.id, { amount: 120000.5, categoryId: mercado.id, occurredOn: "2026-10-31" });
    await add(ana.id, { amount: 410000, categoryId: restaurantes.id });
    await add(ana.id, { amount: 999, categoryId: mercado.id, occurredOn: "2026-09-30" });
    await add(ana.id, { amount: 999, categoryId: mercado.id, occurredOn: "2026-11-01" });
    await add(ana.id, { amount: 999, categoryId: mercado.id, deletedAt: new Date() });
    await add(ana.id, { amount: 999, categoryId: null });
    await add(ana.id, { type: "income", amount: 999, categoryId: salario.id });
    await add(beto.id, { amount: 999, categoryId: mercado.id });

    expect(await getSpentByCategory(ana.id, october)).toEqual(
      new Map([
        [mercado.id, 420000.5],
        [restaurantes.id, 410000],
      ]),
    );

    await saveBudget(cop(ana.id), { categoryId: restaurantes.id, amount: "500.000" });
    await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "1.000.000" });
    expect((await getBudgetProgress(ana.id, october)).map((p) => [p.name, p.spent, p.share, p.level])).toEqual([
      ["Alimentación", 410000, 82, "near"],
      ["Mercado", 420000.5, 42, "ok"],
    ]);
    expect(await getBudgetProgress(beto.id, october)).toEqual([]);

    // Con otro porcentaje en Valores de la app, "cerca" desde ese.
    await db.insert(appValues).values({ id: 1, upcomingEnabled: true, upcomingDays: 3, budgetNearShare: 90, recurringMinMonths: 3, recurringWindow: 4 });
    expect((await getBudgetProgress(ana.id, october)).map((p) => p.level)).toEqual(["ok", "ok"]);
    await db.update(appValues).set({ budgetNearShare: 50 });
    expect((await getBudgetProgress(ana.id, october)).map((p) => p.level)).toEqual(["near", "ok"]);
    await db.delete(appValues);

    // Para uno nuevo, las de egresos sin presupuesto.
    const options = (await listBudgetCategories(ana.id)).map((c) => c.id);
    expect(options).not.toContain(mercado.id);
    expect(options).not.toContain(restaurantes.id);
    expect(options).not.toContain(salario.id);
    expect((await listBudgetCategories(beto.id)).map((c) => c.id)).toContain(mercado.id);
  });
});

describe("getBudgetCrossings (los avisos de lo recién registrado)", () => {
  it("solo cuentan los egresos con categoría de este mes, y solo los presupuestos propios", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const mercado = await globalCategory("Mercado");
    const salario = await globalCategory("Salario", "income");
    await saveBudget(cop(ana.id), { categoryId: mercado.id, amount: "100.000" });
    await db.insert(transaction).values({ userId: ana.id, type: "expense", amount: 85000, description: "Mercado", categoryId: mercado.id, occurredOn: "2026-10-10" });
    await db.insert(transaction).values({ userId: beto.id, type: "expense", amount: 85000, description: "Mercado", categoryId: mercado.id, occurredOn: "2026-10-10" });
    const added = (values: Partial<{ type: "income" | "expense"; categoryId: string | null; amount: number; occurredOn: string }>) => [
      { type: "expense" as const, categoryId: mercado.id, amount: 85000, occurredOn: "2026-10-10", ...values },
    ];

    expect((await getBudgetCrossings(ana.id, october, added({}))).map((c) => [c.name, c.level, c.share])).toEqual([["Mercado", "near", 85]]);
    // Con "cerca" desde el 90 % (Valores de la app), llegar al 85 % no avisa.
    await db.insert(appValues).values({ id: 1, upcomingEnabled: true, upcomingDays: 3, budgetNearShare: 90, recurringMinMonths: 3, recurringWindow: 4 });
    expect(await getBudgetCrossings(ana.id, october, added({}))).toEqual([]);
    await db.delete(appValues);
    // Beto no tiene presupuesto: lo de Ana no le avisa nada.
    expect(await getBudgetCrossings(beto.id, october, added({}))).toEqual([]);
    expect(await getBudgetCrossings(ana.id, october, added({ type: "income", categoryId: salario.id }))).toEqual([]);
    expect(await getBudgetCrossings(ana.id, october, added({ categoryId: null }))).toEqual([]);
    expect(await getBudgetCrossings(ana.id, october, added({ occurredOn: "2026-09-30" }))).toEqual([]);
    expect(await getBudgetCrossings(ana.id, october, [])).toEqual([]);
  });
});

describe("la base", () => {
  it("un presupuesto por categoría y persona, siempre mayor que cero", async () => {
    const ana = await createUser();
    const mercado = await globalCategory("Mercado");
    await expect(db.insert(categoryBudget).values({ userId: ana.id, categoryId: mercado.id, amount: 0 })).rejects.toThrow();
    await db.insert(categoryBudget).values({ userId: ana.id, categoryId: mercado.id, amount: 1 });
    await expect(db.insert(categoryBudget).values({ userId: ana.id, categoryId: mercado.id, amount: 2 })).rejects.toThrow();
  });
});

describe("saveBudgetAction y removeBudgetAction", () => {
  it("sin sesión llevan al login", async () => {
    await expect(saveBudgetAction({}, form({ categoryId: "x", amount: "1" }))).rejects.toThrow("NEXT_REDIRECT /login");
    await expect(removeBudgetAction({}, form({ categoryId: "x" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("guardan y quitan el presupuesto de quien tiene la sesión (nunca el de otra cuenta), refrescan y avisan", async () => {
    const beto = await createUser();
    const mercado = await globalCategory("Mercado");
    await saveBudget(cop(beto.id), { categoryId: mercado.id, amount: "1" });
    const ana = await signIn();

    expect(await saveBudgetAction({}, form({ categoryId: mercado.id, amount: "300.000" }))).toEqual({
      message: "Se guardó el presupuesto de Mercado: $300.000,00 al mes",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect((await listBudgets(ana.id)).map((b) => b.amount)).toEqual([300000]);
    expect((await listBudgets(beto.id)).map((b) => b.amount)).toEqual([1]);

    expect(await removeBudgetAction({}, form({ categoryId: mercado.id }))).toEqual({ message: "Se quitó el presupuesto de Mercado", tone: "removal" });
    expect(await listBudgets(ana.id)).toEqual([]);
    expect(await listBudgets(beto.id)).toHaveLength(1);
  });

  it("con un error lo devuelven (con su campo), no guardan nada y no refrescan; en inglés, en el idioma de la página", async () => {
    const ana = await signIn();
    const mercado = await globalCategory("Mercado");
    expect(await saveBudgetAction({}, form({ categoryId: mercado.id, amount: "0" }))).toEqual({ error: "Escribe un monto mayor que cero.", field: "amount" });
    expect(await removeBudgetAction({}, form({ categoryId: mercado.id }))).toEqual({ error: "Ese presupuesto ya no existe." });
    expect(refresh).not.toHaveBeenCalled();
    expect(await listBudgets(ana.id)).toEqual([]);

    requestLocale.value = "en";
    expect(await saveBudgetAction({}, form({ categoryId: "x", amount: "1" }))).toEqual({ error: "Choose a category.", field: "categoryId" });
    expect(await removeBudgetAction({}, form({ categoryId: mercado.id }))).toEqual({ error: "That budget no longer exists." });
  });
});
