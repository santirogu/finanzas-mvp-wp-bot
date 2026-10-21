import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { listCategories } from "@/modules/transactions/queries";
import { createUser } from "../../../test/integration/factories";

// "Registrar pago" (los avisos de próximos pagos): la capa de datos y su Server Action, contra la base de
// pruebas, con dos usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getLastPayments, registerFixedPayment } = await import("./fixed-payments");
const { registerFixedPaymentAction } = await import("./actions");

const TODAY = "2026-10-20";
const globalCategory = async (name: string) => (await listCategories("nadie", "expense")).find((c) => c.name === name)!;
const addExpense = (userId: string, values: Partial<typeof transaction.$inferInsert>) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 120000, description: "Gimnasio", occurredOn: "2026-09-15", ...values });
const expensesOf = (userId: string, description: string) =>
  db
    .select({ amount: transaction.amount, occurredOn: transaction.occurredOn, categoryId: transaction.categoryId, source: transaction.source })
    .from(transaction)
    .where(and(eq(transaction.userId, userId), eq(transaction.description, description)))
    .orderBy(transaction.occurredOn);
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

describe("getLastPayments", () => {
  it("de cada gasto, la descripción y la categoría del último pago (escrito distinto es el mismo); sin lo eliminado", async () => {
    const user = await createUser();
    const salud = await globalCategory("Salud");
    await addExpense(user.id, { description: "gimnasio", occurredOn: "2026-08-15" });
    await addExpense(user.id, { description: "Gimnasio ", categoryId: salud.id, occurredOn: "2026-09-15" });
    await addExpense(user.id, { description: "Gimnasio borrado", occurredOn: "2026-10-01", deletedAt: new Date() });
    await addExpense(user.id, { description: "Salario", type: "income", occurredOn: "2026-10-01" });
    const last = await getLastPayments(user.id);
    expect(last.get("gimnasio")).toEqual({ description: "Gimnasio ", categoryId: salud.id, category: `${salud.emoji} Salud` });
    expect(last.has("gimnasio borrado")).toBe(false);
    expect(last.has("salario")).toBe(false);
  });

  it("en inglés, con el nombre en inglés de la categoría", async () => {
    const user = await createUser();
    const salud = await globalCategory("Salud");
    await db.update(category).set({ nameEn: "Health" }).where(eq(category.id, salud.id));
    await addExpense(user.id, { categoryId: salud.id });
    expect((await getLastPayments(user.id, "en")).get("gimnasio")).toMatchObject({ category: `${salud.emoji} Health` });
    expect((await getLastPayments(user.id)).get("gimnasio")).toMatchObject({ category: `${salud.emoji} Salud` });
  });
});

describe("registerFixedPayment", () => {
  it("lo registra como un egreso con la descripción y la categoría del último pago, el monto y la fecha que se confirmaron", async () => {
    const user = await createUser();
    const salud = await globalCategory("Salud");
    await addExpense(user.id, { categoryId: salud.id });
    expect(await registerFixedPayment(user, { description: "gimnasio", amount: "125.000,50", occurredOn: "2026-10-18" }, TODAY)).toEqual({
      ok: true,
      message: "Se registró el pago de «Gimnasio»: −$125.000,50",
      tone: "success",
    });
    expect(await expensesOf(user.id, "Gimnasio")).toEqual([
      { amount: 120000, occurredOn: "2026-09-15", categoryId: salud.id, source: "web" },
      { amount: 125000.5, occurredOn: "2026-10-18", categoryId: salud.id, source: "web" },
    ]);
  });

  it("si la categoría del último pago ya no se puede elegir (archivada), va sin categoría", async () => {
    const user = await createUser();
    const [archived] = await db
      .insert(category)
      .values({ userId: null, type: "expense", name: `Archivada ${user.id}`, emoji: "🗄️", archivedAt: new Date() })
      .returning();
    await addExpense(user.id, { categoryId: archived.id });
    await registerFixedPayment(user, { description: "Gimnasio", amount: "120000", occurredOn: TODAY }, TODAY);
    expect((await expensesOf(user.id, "Gimnasio")).map((e) => e.categoryId)).toEqual([archived.id, null]);
  });

  it.each([
    [{ amount: "", occurredOn: TODAY }, { error: "Ingresa un monto mayor que cero", field: "amount" }],
    [{ amount: "0", occurredOn: TODAY }, { error: "Ingresa un monto mayor que cero", field: "amount" }],
    [{ amount: "1000", occurredOn: "2026-10-21" }, { error: "La fecha no puede ser después de hoy.", field: "occurredOn" }],
    [{ amount: "1000", occurredOn: "20/10/2026" }, { error: "Fecha inválida", field: "occurredOn" }],
    [{ amount: null, occurredOn: null }, { error: "Ingresa un monto mayor que cero", field: "amount" }],
  ])("con %j no registra nada y dice qué campo revisar", async (values, error) => {
    const user = await createUser();
    await addExpense(user.id, {});
    expect(await registerFixedPayment(user, { description: "Gimnasio", ...values }, TODAY)).toEqual({ ok: false, ...error });
    expect(await expensesOf(user.id, "Gimnasio")).toHaveLength(1);
  });

  it("solo un gasto propio: el de otra cuenta (o uno inventado) no se puede registrar así", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const salud = await globalCategory("Salud");
    await addExpense(beto.id, { description: "Colegio de Beto", categoryId: salud.id });
    for (const description of ["Colegio de Beto", "Inventado", null]) {
      expect(await registerFixedPayment(ana, { description, amount: "1000", occurredOn: TODAY }, TODAY)).toEqual({
        ok: false,
        error: "No encontramos ese gasto entre tus egresos.",
      });
    }
    expect(await expensesOf(ana.id, "Colegio de Beto")).toEqual([]);
  });
});

describe("registerFixedPaymentAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(registerFixedPaymentAction({}, form({ description: "Gimnasio", amount: "1000", occurredOn: TODAY }))).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
  });

  it("registra el de quien tiene la sesión (hoy, en su zona), refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    await addExpense(user.id, {});
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date());
    expect(await registerFixedPaymentAction({}, form({ description: "Gimnasio", amount: "120.000,00", occurredOn: today }))).toEqual({
      message: "Se registró el pago de «Gimnasio»: −$120.000,00",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect((await expensesOf(user.id, "Gimnasio")).map((e) => e.occurredOn)).toEqual(["2026-09-15", today].sort());
  });

  it("con un error lo devuelve con su campo, no registra nada y no refresca", async () => {
    const user = await signIn();
    await addExpense(user.id, {});
    expect(await registerFixedPaymentAction({}, form({ description: "Gimnasio", amount: "", occurredOn: "2026-10-01" }))).toEqual({
      error: "Ingresa un monto mayor que cero",
      field: "amount",
    });
    expect(await expensesOf(user.id, "Gimnasio")).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("registerFixedPayment · en inglés", () => {
  it("lee el monto con la coma de miles y responde en inglés", async () => {
    const { id } = await createUser();
    await addExpense(id, {});
    expect(await registerFixedPayment({ id, currency: "COP" }, { description: "Gimnasio", amount: "125,000.50", occurredOn: TODAY }, TODAY, "en")).toEqual({
      ok: true,
      message: "The payment of “Gimnasio” was added: −$125,000.50",
      tone: "success",
    });
    expect((await expensesOf(id, "Gimnasio")).map((e) => e.amount)).toContain(125000.5);
    expect(await registerFixedPayment({ id, currency: "COP" }, { description: "Gimnasio", amount: "1,000", occurredOn: "2026-10-21" }, TODAY, "en")).toEqual({
      ok: false,
      error: "The date can't be after today.",
      field: "occurredOn",
    });
    expect(await registerFixedPayment({ id, currency: "COP" }, { description: "Otro", amount: "1,000", occurredOn: TODAY }, TODAY, "en")).toEqual({
      ok: false,
      error: "We couldn't find that expense among yours.",
    });
  });
});
