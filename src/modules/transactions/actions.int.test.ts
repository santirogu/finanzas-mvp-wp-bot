import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { category } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { activeTransactions, createUser } from "../../../test/integration/factories";

// Las Server Actions leen la sesión y refrescan la página: se simulan ambas cosas.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { createTransactionAction, deleteTransactionAction } = await import("./actions");

async function signIn() {
  const user = await createUser();
  session.current = {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    currency: user.currency,
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

beforeEach(() => {
  session.current = null;
});

describe("createTransactionAction", () => {
  it("registra el movimiento leyendo el monto en formato colombiano", async () => {
    const user = await signIn();

    const state = await createTransactionAction({ ok: false }, form(validExpense));

    expect(state).toEqual({ ok: true, message: "Egreso registrado" });
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

    expect(state.fieldErrors?.categoryId).toBe("Categoría inválida");
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

    expect(state.fieldErrors?.categoryId).toBe("Categoría inválida");
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

describe("deleteTransactionAction", () => {
  it("elimina (borrado lógico) un movimiento propio", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form(validExpense));
    const [tx] = await activeTransactions(user.id);

    await deleteTransactionAction(form({ id: tx.id }));

    expect(await activeTransactions(user.id)).toEqual([]);
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
