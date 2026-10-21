import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { activeTransactions, createUser } from "../../../test/integration/factories";
import { requestLocale } from "../../../test/integration/locale";

// Las Server Actions leen la sesión y refrescan la página: se simulan ambas cosas.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

// redirect() de Next lanza un error especial para cortar la acción: aquí uno con la URL.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const { createTransactionAction, deleteTransactionAction, restoreTransactionAction, updateTransactionAction } =
  await import("./actions");

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

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const validExpense = {
  type: "expense",
  amount: "500.000",
  description: "Zapatos",
  categoryId: "",
  occurredOn: "2026-10-13",
};

// Hoy es el 20 de octubre de 2026 en Bogotá: un movimiento de octubre vuelve a su lista sin ?mes= y
// uno de septiembre, a la de septiembre (?mes=2026-09). Solo se congela la fecha, no los timers.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T17:00:00Z") });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  session.current = null;
});

describe("createTransactionAction", () => {
  it("registra el movimiento leyendo el monto en formato colombiano", async () => {
    const user = await signIn();

    const state = await createTransactionAction({ ok: false }, form(validExpense));

    expect(state).toEqual({ ok: true, message: "Egreso registrado", occurredOn: "2026-10-13" });
    expect(await activeTransactions(user.id)).toEqual([
      expect.objectContaining({
        type: "expense",
        amount: 500000,
        description: "Zapatos",
        source: "web",
        currency: "COP",
        categoryId: null,
      }),
    ]);
  });

  it("guarda los centavos escritos después de la coma, exactos", async () => {
    const user = await signIn();

    await createTransactionAction({ ok: false }, form({ ...validExpense, amount: "45.900,50" }));
    await createTransactionAction({ ok: false }, form({ ...validExpense, amount: "0,01" }));

    expect((await activeTransactions(user.id)).map((t) => t.amount).sort((a, b) => a - b)).toEqual([0.01, 45900.5]);
    const stored = await db.execute<{ amount: string }>(
      sql`select amount::text as amount from "transaction" where user_id = ${user.id} order by amount`,
    );
    expect(stored.map((row) => row.amount)).toEqual(["0.01", "45900.50"]);
  });

  it.each([
    ["45.900,505", "Escribe un monto mayor que cero."],
    ["100.000.000.000,01", "El monto no puede pasar de $100.000.000.000,00."],
  ])("rechaza el monto %j sin guardar nada", async (amount, error) => {
    const user = await signIn();

    const state = await createTransactionAction({ ok: false }, form({ ...validExpense, amount }));

    expect(state).toMatchObject({ ok: false, fieldErrors: { amount: error } });
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("devuelve errores por campo y conserva lo escrito, sin guardar nada", async () => {
    const user = await signIn();

    const state = await createTransactionAction(
      { ok: false },
      form({ ...validExpense, amount: "0", description: "  " }),
    );

    expect(state.ok).toBe(false);
    expect(state.fieldErrors).toMatchObject({
      amount: expect.any(String),
      description: expect.any(String),
    });
    expect(state.values).toMatchObject({ amount: "0" });
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("rechaza una categoría de otro tipo", async () => {
    const user = await signIn();
    // Categoría global de ingresos usada en un egreso.
    const [salario] = await db.select().from(category).where(eq(category.name, "Salario"));

    const state = await createTransactionAction(
      { ok: false },
      form({ ...validExpense, categoryId: salario.id }),
    );

    expect(state.fieldErrors?.categoryId).toBe("Esa categoría ya no está disponible. Elige otra.");
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("rechaza una categoría que el admin archivó", async () => {
    const user = await signIn();
    const [ropa] = await db.select().from(category).where(eq(category.name, "Ropa"));
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, ropa.id));

    const state = await createTransactionAction({ ok: false }, form({ ...validExpense, categoryId: ropa.id }));

    expect(state.fieldErrors?.categoryId).toBe("Esa categoría ya no está disponible. Elige otra.");
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("rechaza la categoría personal de otro usuario", async () => {
    const user = await signIn();
    const other = await createUser();
    const [secret] = await db
      .insert(category)
      .values({ userId: other.id, type: "expense", name: "Secreta" })
      .returning();

    const state = await createTransactionAction(
      { ok: false },
      form({ ...validExpense, categoryId: secret.id }),
    );

    expect(state.fieldErrors?.categoryId).toBe("Esa categoría ya no está disponible. Elige otra.");
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("exige sesión", async () => {
    await expect(createTransactionAction({ ok: false }, form(validExpense))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("ignora campos extra del formulario: el dueño, la moneda y el origen salen del servidor", async () => {
    const victim = await createUser({ currency: "USD" });
    const user = await signIn();

    await createTransactionAction(
      { ok: false },
      form({
        ...validExpense,
        userId: victim.id,
        currency: "USD",
        source: "whatsapp",
        externalId: "wamid.falso:0",
        deletedAt: "2026-01-01",
      }),
    );

    expect(await activeTransactions(victim.id)).toEqual([]);
    expect(await activeTransactions(user.id)).toEqual([
      expect.objectContaining({
        userId: user.id,
        currency: "COP",
        source: "web",
        externalId: null,
        deletedAt: null,
      }),
    ]);
  });
});

describe("createTransactionAction · en inglés", () => {
  it("lee el monto con la coma de miles y el punto de centavos, y responde en inglés", async () => {
    const user = await signIn();
    requestLocale.value = "en";

    const state = await createTransactionAction({ ok: false }, form({ ...validExpense, amount: "1,250,000.50" }));

    expect(state).toEqual({ ok: true, message: "Expense added", occurredOn: "2026-10-13" });
    expect((await activeTransactions(user.id)).map((t) => t.amount)).toEqual([1250000.5]);
  });

  it("los errores de los campos, en inglés", async () => {
    await signIn();
    requestLocale.value = "en";

    const state = await createTransactionAction({ ok: false }, form({ ...validExpense, type: "income", amount: "0", description: " " }));
    expect(state.fieldErrors).toEqual({ amount: "Enter an amount greater than zero.", description: "Enter a description." });
    const tooMuch = await createTransactionAction({ ok: false }, form({ ...validExpense, amount: "100,000,000,000.01" }));
    expect(tooMuch.fieldErrors).toEqual({ amount: "The amount can't be more than $100,000,000,000.00." });
    // "500.000" en inglés serían 500 con tres decimales: no es un monto.
    expect((await createTransactionAction({ ok: false }, form(validExpense))).fieldErrors).toEqual({ amount: "Enter an amount greater than zero." });
    const income = await createTransactionAction({ ok: false }, form({ ...validExpense, type: "income", amount: "500,000" }));
    expect(income).toMatchObject({ ok: true, message: "Income added" });
  });
});

describe("deleteTransactionAction", () => {
  it("elimina (borrado lógico) un movimiento propio y vuelve a su lista con el aviso", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(user.id);

    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow(`NEXT_REDIRECT /egresos?borrado=${tx.id}`);

    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("un ingreso vuelve a Ingresos", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...validExpense, type: "income" }));
    const [tx] = await activeTransactions(user.id);

    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow(`NEXT_REDIRECT /ingresos?borrado=${tx.id}`);
  });

  it("uno de un mes anterior vuelve a la lista de ese mes", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...validExpense, occurredOn: "2026-09-30" }));
    const [tx] = await activeTransactions(user.id);

    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow(
      `NEXT_REDIRECT /egresos?mes=2026-09&borrado=${tx.id}`,
    );
  });

  it("no puede eliminar movimientos de otro usuario", async () => {
    const owner = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(owner.id);

    await signIn(); // ahora la sesión es de otra persona
    await deleteTransactionAction(form({ id: tx.id }));

    expect(await activeTransactions(owner.id)).toHaveLength(1);
  });

  it("tampoco puede eliminarlos sin sesión", async () => {
    const owner = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(owner.id);

    session.current = null;
    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow("NEXT_REDIRECT");

    expect(await activeTransactions(owner.id)).toHaveLength(1);
  });

  it("ignora IDs inválidos sin lanzar error", async () => {
    await signIn();
    await expect(deleteTransactionAction(form({ id: "no-es-un-uuid" }))).resolves.toBeUndefined();
  });
});

describe("restoreTransactionAction", () => {
  async function deletedExpense() {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(user.id);
    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow("NEXT_REDIRECT");
    return { user, tx };
  }

  it("deshace el borrado y vuelve a la lista con el aviso", async () => {
    const { user, tx } = await deletedExpense();

    await expect(restoreTransactionAction(form({ id: tx.id }))).rejects.toThrow(`NEXT_REDIRECT /egresos?restaurado=${tx.id}`);

    expect((await activeTransactions(user.id)).map((t) => t.id)).toEqual([tx.id]);
  });

  it("uno de un mes anterior vuelve a la lista de ese mes", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...validExpense, type: "income", occurredOn: "2025-12-31" }));
    const [tx] = await activeTransactions(user.id);
    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow("NEXT_REDIRECT");

    await expect(restoreTransactionAction(form({ id: tx.id }))).rejects.toThrow(
      `NEXT_REDIRECT /ingresos?mes=2025-12&restaurado=${tx.id}`,
    );
  });

  it("no restaura movimientos de otro usuario", async () => {
    const { user, tx } = await deletedExpense();

    await signIn(); // ahora la sesión es de otra persona
    await expect(restoreTransactionAction(form({ id: tx.id }))).resolves.toBeUndefined();

    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("no restaura uno borrado hace más de 10 minutos (un enlace viejo)", async () => {
    const { user, tx } = await deletedExpense();
    await db.update(transaction).set({ deletedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(transaction.id, tx.id));

    await expect(restoreTransactionAction(form({ id: tx.id }))).resolves.toBeUndefined();

    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("tampoco sin sesión, y no hace nada con un id inválido", async () => {
    const { user, tx } = await deletedExpense();

    await expect(restoreTransactionAction(form({ id: "no-es-un-uuid" }))).resolves.toBeUndefined();
    session.current = null;
    await expect(restoreTransactionAction(form({ id: tx.id }))).rejects.toThrow("NEXT_REDIRECT /login");

    expect(await activeTransactions(user.id)).toEqual([]);
  });
});

describe("updateTransactionAction", () => {
  const editForm = (id: string, overrides: Record<string, string> = {}) =>
    form({ ...validExpense, id, amount: "450.000", description: "Zapatos rebajados", ...overrides });

  async function ownExpense() {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(user.id);
    return { user, tx };
  }

  it("guarda los cambios de un movimiento propio y vuelve a la lista de su tipo, con el aviso", async () => {
    const { user, tx } = await ownExpense();
    const [ropa] = await db.select().from(category).where(eq(category.name, "Ropa"));

    await expect(
      updateTransactionAction({ ok: false }, editForm(tx.id, { categoryId: ropa.id, occurredOn: "2026-10-01" })),
    ).rejects.toThrow(/^NEXT_REDIRECT \/egresos\?aviso=guardado$/);

    expect(await activeTransactions(user.id)).toEqual([
      expect.objectContaining({
        id: tx.id,
        type: "expense",
        amount: 450000,
        description: "Zapatos rebajados",
        categoryId: ropa.id,
        occurredOn: "2026-10-01",
        source: "web",
      }),
    ]);
  });

  it("corrige el monto con centavos", async () => {
    const { user, tx } = await ownExpense();

    await expect(updateTransactionAction({ ok: false }, editForm(tx.id, { amount: "1.250.000,05" }))).rejects.toThrow(
      "NEXT_REDIRECT /egresos",
    );

    expect(await activeTransactions(user.id)).toEqual([expect.objectContaining({ id: tx.id, amount: 1250000.05 })]);
  });

  it("si la fecha queda en otro mes, vuelve a la lista de ese mes", async () => {
    const { tx } = await ownExpense();

    await expect(updateTransactionAction({ ok: false }, editForm(tx.id, { occurredOn: "2026-09-28" }))).rejects.toThrow(
      "NEXT_REDIRECT /egresos?mes=2026-09&aviso=guardado",
    );
  });

  it("un ingreso vuelve a la lista de ingresos", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...validExpense, type: "income", description: "Sueldo" }));
    const [tx] = await activeTransactions(user.id);

    await expect(
      updateTransactionAction({ ok: false }, editForm(tx.id, { type: "income" })),
    ).rejects.toThrow("NEXT_REDIRECT /ingresos");
  });

  it("devuelve los errores por campo sin cambiar nada", async () => {
    const { user, tx } = await ownExpense();

    const state = await updateTransactionAction({ ok: false }, editForm(tx.id, { amount: "0", description: " " }));

    expect(state).toMatchObject({
      ok: false,
      fieldErrors: { amount: "Escribe un monto mayor que cero.", description: "Escribe una descripción." },
    });
    expect((await activeTransactions(user.id))[0]).toMatchObject({ amount: 500000, description: "Zapatos" });
  });

  it("no puede editar movimientos de otro usuario", async () => {
    const { user: owner, tx } = await ownExpense();
    await signIn(); // ahora la sesión es de otra persona

    const state = await updateTransactionAction({ ok: false }, editForm(tx.id));

    expect(state).toMatchObject({ ok: false, message: "No encontramos ese movimiento." });
    expect((await activeTransactions(owner.id))[0]).toMatchObject({ amount: 500000, description: "Zapatos" });
  });

  it("no puede cambiar el tipo de un movimiento (un egreso no pasa a ser ingreso)", async () => {
    const { user, tx } = await ownExpense();

    const state = await updateTransactionAction({ ok: false }, editForm(tx.id, { type: "income" }));

    expect(state).toMatchObject({ ok: false, message: "No encontramos ese movimiento." });
    expect((await activeTransactions(user.id))[0]).toMatchObject({ type: "expense", amount: 500000 });
  });

  it("no puede editar un movimiento eliminado", async () => {
    const { user, tx } = await ownExpense();
    await expect(deleteTransactionAction(form({ id: tx.id }))).rejects.toThrow("NEXT_REDIRECT");

    const state = await updateTransactionAction({ ok: false }, editForm(tx.id));

    expect(state).toMatchObject({ ok: false, message: "No encontramos ese movimiento." });
    const [row] = await db.select().from(transaction).where(eq(transaction.id, tx.id));
    expect(row).toMatchObject({ amount: 500000, userId: user.id });
  });

  it("rechaza un id inválido y la categoría de otro usuario", async () => {
    const { user, tx } = await ownExpense();
    expect(await updateTransactionAction({ ok: false }, editForm("no-es-un-uuid"))).toMatchObject({
      ok: false,
      message: "No encontramos ese movimiento.",
    });

    const other = await createUser();
    const [personal] = await db
      .insert(category)
      .values({ userId: other.id, type: "expense", name: "Ajena", emoji: "x" })
      .returning();
    expect(await updateTransactionAction({ ok: false }, editForm(tx.id, { categoryId: personal.id }))).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: "Esa categoría ya no está disponible. Elige otra." },
    });
    expect((await activeTransactions(user.id))[0]).toMatchObject({ categoryId: null });
  });

  it("ignora campos extra: no cambia el dueño, el origen ni el id externo", async () => {
    const victim = await createUser();
    const { user, tx } = await ownExpense();

    await expect(
      updateTransactionAction(
        { ok: false },
        editForm(tx.id, { userId: victim.id, source: "whatsapp", externalId: "wamid.falso:0", currency: "USD" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(await activeTransactions(victim.id)).toEqual([]);
    expect((await activeTransactions(user.id))[0]).toMatchObject({
      userId: user.id,
      source: "web",
      externalId: null,
      currency: "COP",
    });
  });

  it("también corrige lo que registró el bot, sin perder su origen (deshacer sigue funcionando)", async () => {
    const user = await signIn();
    const [botTx] = await db
      .insert(transaction)
      .values({
        userId: user.id,
        type: "expense",
        amount: 50000,
        description: "Mercado",
        occurredOn: "2026-10-10",
        source: "whatsapp",
        externalId: "wamid.bot:0",
      })
      .returning();

    await expect(
      updateTransactionAction({ ok: false }, editForm(botTx.id, { amount: "55.000", description: "Mercado" })),
    ).rejects.toThrow("NEXT_REDIRECT /egresos");

    expect((await activeTransactions(user.id))[0]).toMatchObject({
      amount: 55000,
      source: "whatsapp",
      externalId: "wamid.bot:0",
    });
  });

  it("exige sesión", async () => {
    await expect(updateTransactionAction({ ok: false }, editForm("00000000-0000-4000-8000-000000000000"))).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
  });

  it("puede conservar la categoría archivada que ya tenía, pero no pasarse a otra archivada", async () => {
    const { user, tx } = await ownExpense();
    const [ropa] = await db.select().from(category).where(eq(category.name, "Ropa"));
    const [salud] = await db.select().from(category).where(eq(category.name, "Salud"));
    await db.update(transaction).set({ categoryId: ropa.id }).where(eq(transaction.id, tx.id));
    await db.update(category).set({ archivedAt: new Date() }).where(inArray(category.id, [ropa.id, salud.id]));

    await expect(updateTransactionAction({ ok: false }, editForm(tx.id, { categoryId: ropa.id }))).rejects.toThrow("NEXT_REDIRECT /egresos");
    expect((await activeTransactions(user.id))[0]).toMatchObject({ categoryId: ropa.id, description: "Zapatos rebajados" });

    expect(await updateTransactionAction({ ok: false }, editForm(tx.id, { categoryId: salud.id }))).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: "Esa categoría ya no está disponible. Elige otra." },
    });
  });
});
