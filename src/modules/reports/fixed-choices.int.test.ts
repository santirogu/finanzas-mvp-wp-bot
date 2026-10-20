import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { fixedExpenseChoice, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { refresh } from "next/cache";
import { createUser } from "../../../test/integration/factories";

// Los gastos fijos marcados a mano: la capa de datos y su Server Action, contra la base de pruebas.
// La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { chooseFixedExpense, getFixedChoices } = await import("./fixed-choices");
const { chooseFixedExpenseAction } = await import("./actions");

const addExpense = (userId: string, description: string, deletedAt: Date | null = null) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 1000, description, occurredOn: "2026-10-05", deletedAt });
const choicesOf = (userId: string) =>
  db
    .select({ key: fixedExpenseChoice.descriptionKey, choice: fixedExpenseChoice.choice })
    .from(fixedExpenseChoice)
    .where(eq(fixedExpenseChoice.userId, userId));
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

async function signIn() {
  const user = await createUser();
  session.current = {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    currency: user.currency,
    role: user.role,
    superAdmin: user.superAdmin,
    twoFactorEnabled: user.twoFactorEnabled,
  };
  return user;
}

beforeEach(() => {
  session.current = null;
  vi.mocked(refresh).mockClear();
});

describe("chooseFixedExpense", () => {
  it("agrega uno de sus egresos (con la clave sin mayúsculas ni tildes) y avisa en verde", async () => {
    const user = await createUser();
    await addExpense(user.id, "Seguro del Carro Cívico");
    expect(await chooseFixedExpense(user.id, { description: "Seguro del Carro Cívico", action: "include" })).toEqual({
      ok: true,
      message: "Se agregó «Seguro del Carro Cívico» a los gastos fijos",
      tone: "success",
    });
    expect(await choicesOf(user.id)).toEqual([{ key: "seguro del carro civico", choice: "include" }]);
  });

  it.each(["include", "exclude"])(
    "solo marca (%s) lo que está entre sus egresos: no uno inventado, borrado, ingreso ni de otra cuenta",
    async (action) => {
      const user = await createUser();
      const other = await createUser();
      await addExpense(other.id, "Arriendo de Beto");
      await addExpense(user.id, "Borrado", new Date());
      await db.insert(transaction).values({ userId: user.id, type: "income", amount: 1, description: "Salario", occurredOn: "2026-10-05" });
      for (const description of ["Inventado", "Arriendo de Beto", "Borrado", "Salario"]) {
        expect(await chooseFixedExpense(user.id, { description, action })).toEqual({
          ok: false,
          error: "Ese egreso no está entre tus movimientos.",
        });
      }
      expect(await choicesOf(user.id)).toEqual([]);
    },
  );

  it("encuentra el egreso aunque esté escrito con otras mayúsculas o espacios", async () => {
    const user = await createUser();
    await addExpense(user.id, "  netflix ");
    expect((await chooseFixedExpense(user.id, { description: "Netflix", action: "include" })).ok).toBe(true);
  });

  it("quitar uno lo marca; marcarlo de nuevo cambia la marca (no la repite)", async () => {
    const user = await createUser();
    await addExpense(user.id, "Netflix");
    expect(await chooseFixedExpense(user.id, { description: "Netflix", action: "exclude" })).toEqual({
      ok: true,
      message: "Se quitó «Netflix» de los gastos fijos",
      tone: "removal",
    });
    expect(await choicesOf(user.id)).toEqual([{ key: "netflix", choice: "exclude" }]);
    await chooseFixedExpense(user.id, { description: "netflix", action: "include" });
    expect(await choicesOf(user.id)).toEqual([{ key: "netflix", choice: "include" }]);
  });

  it("volver a poner borra solo un quitado; sacar uno agregado, solo un agregado", async () => {
    const user = await createUser();
    await addExpense(user.id, "Netflix");
    await chooseFixedExpense(user.id, { description: "Netflix", action: "include" });
    // "Volver a poner" no toca un agregado.
    expect(await chooseFixedExpense(user.id, { description: "Netflix", action: "restore" })).toEqual({
      ok: true,
      message: "Volvió «Netflix» a los gastos fijos",
      tone: "success",
    });
    expect(await choicesOf(user.id)).toEqual([{ key: "netflix", choice: "include" }]);
    expect(await chooseFixedExpense(user.id, { description: "Netflix", action: "unadd" })).toEqual({
      ok: true,
      message: "Se quitó «Netflix» de los gastos fijos",
      tone: "removal",
    });
    expect(await choicesOf(user.id)).toEqual([]);

    await chooseFixedExpense(user.id, { description: "Netflix", action: "exclude" });
    await chooseFixedExpense(user.id, { description: "Netflix", action: "unadd" });
    expect(await choicesOf(user.id)).toEqual([{ key: "netflix", choice: "exclude" }]);
    await chooseFixedExpense(user.id, { description: "Netflix", action: "restore" });
    expect(await choicesOf(user.id)).toEqual([]);
  });

  it("no toca las marcas de otra cuenta", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await addExpense(ana.id, "Netflix");
    await addExpense(beto.id, "Netflix");
    await chooseFixedExpense(beto.id, { description: "Netflix", action: "exclude" });
    await chooseFixedExpense(ana.id, { description: "Netflix", action: "include" });
    await chooseFixedExpense(ana.id, { description: "Netflix", action: "unadd" });
    expect(await choicesOf(beto.id)).toEqual([{ key: "netflix", choice: "exclude" }]);
    expect(await getFixedChoices(ana.id)).toEqual({ include: new Set(), exclude: new Set() });
  });

  it.each([
    [{ description: "", action: "include" }],
    [{ description: "   ", action: "exclude" }],
    [{ description: "x".repeat(141), action: "exclude" }],
    [{ description: "Netflix", action: "borrar" }],
    [{ description: null, action: "include" }],
  ])("con algo mal (%j) no guarda nada", async (raw) => {
    const user = await createUser();
    expect(await chooseFixedExpense(user.id, raw)).toEqual({ ok: false, error: "Elige un egreso." });
    expect(await choicesOf(user.id)).toEqual([]);
  });
});

describe("getFixedChoices", () => {
  it("las claves que agregó y las que quitó, solo de esa cuenta", async () => {
    const user = await createUser();
    const other = await createUser();
    await db.insert(fixedExpenseChoice).values([
      { userId: user.id, descriptionKey: "seguro", choice: "include" },
      { userId: user.id, descriptionKey: "netflix", choice: "exclude" },
      { userId: other.id, descriptionKey: "arriendo", choice: "exclude" },
    ]);
    expect(await getFixedChoices(user.id)).toEqual({ include: new Set(["seguro"]), exclude: new Set(["netflix"]) });
  });
});

describe("chooseFixedExpenseAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(chooseFixedExpenseAction({}, form({ description: "Netflix", action: "exclude" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("marca el gasto de quien tiene la sesión, refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    await addExpense(user.id, "Netflix");
    expect(await chooseFixedExpenseAction({}, form({ description: "Netflix", action: "exclude" }))).toEqual({
      message: "Se quitó «Netflix» de los gastos fijos",
      tone: "removal",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await choicesOf(user.id)).toEqual([{ key: "netflix", choice: "exclude" }]);
  });

  it("con un error lo devuelve, no guarda nada y no refresca", async () => {
    const user = await signIn();
    expect(await chooseFixedExpenseAction({}, form({ description: "Inventado", action: "include" }))).toEqual({
      error: "Ese egreso no está entre tus movimientos.",
    });
    expect(await choicesOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("chooseFixedExpense · en inglés", () => {
  it("los avisos y los errores, en inglés", async () => {
    const { id } = await createUser();
    await addExpense(id, "Netflix");
    expect(await chooseFixedExpense(id, { description: "Netflix", action: "include" }, "en")).toEqual({
      ok: true,
      message: "“Netflix” was added to your bills",
      tone: "success",
    });
    expect((await chooseFixedExpense(id, { description: "Netflix", action: "restore" }, "en")).ok).toBe(true);
    expect(await chooseFixedExpense(id, { description: "Netflix", action: "exclude" }, "en")).toMatchObject({ message: "“Netflix” was removed from your bills" });
    expect(await chooseFixedExpense(id, { description: "Otro", action: "include" }, "en")).toEqual({ ok: false, error: "That expense isn't among your transactions." });
    expect(await chooseFixedExpense(id, { description: "", action: "include" }, "en")).toEqual({ ok: false, error: "Pick an expense." });
  });
});
