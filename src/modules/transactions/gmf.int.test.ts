import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { category, transaction, user as userTable } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { activeTransactions, createUser } from "../../../test/integration/factories";
import { requestLocale } from "../../../test/integration/locale";

// El 4x1000 desde la web: "Aplicar 4x1000" en el formulario de egresos y Configuración. Las Server Actions leen la
// sesión y refrescan la página: se simulan ambas cosas.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const { createTransactionAction, deleteTransactionAction, restoreTransactionAction, saveGmfSettingAction, updateTransactionAction } =
  await import("./actions");
const { addGmf, getGmfEnabled, taxCategoryId } = await import("./gmf");

async function signIn(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(overrides);
  session.current = {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    role: user.role,
    superAdmin: user.superAdmin,
    twoFactorEnabled: user.twoFactorEnabled,
    privacyVersion: user.privacyVersion,
  };
  return user;
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const expense = { type: "expense", amount: "500.000", description: "Arriendo", categoryId: "", occurredOn: "2026-10-05" };

const taxCategory = async () => {
  const rows = await db.select().from(category).where(and(isNull(category.userId), eq(category.type, "expense"), eq(category.name, "Impuestos")));
  return rows;
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T17:00:00Z") });
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  session.current = null;
});

describe("Aplicar 4x1000 (createTransactionAction)", () => {
  it("registra aparte el 0,4 % del egreso, en Impuestos, con su fecha y atado a él", async () => {
    const user = await signIn();
    const state = await createTransactionAction({ ok: false }, form({ ...expense, gmf: "on" }));
    expect(state).toMatchObject({ ok: true, message: "Egreso y 4x1000 registrados" });

    const rows = await activeTransactions(user.id);
    const parent = rows.find((row) => row.description === "Arriendo")!;
    const tax = rows.find((row) => row.taxOf === parent.id)!;
    const [impuestos] = await taxCategory();
    expect(tax).toMatchObject({
      type: "expense",
      amount: 2000,
      description: "4x1000 · Arriendo",
      categoryId: impuestos.id,
      occurredOn: "2026-10-05",
      source: "web",
      externalId: null,
    });
    expect(rows).toHaveLength(2);
  });

  it("sin la casilla, solo el egreso", async () => {
    const user = await signIn();
    expect(await createTransactionAction({ ok: false }, form(expense))).toMatchObject({ ok: true, message: "Egreso registrado" });
    expect(await activeTransactions(user.id)).toHaveLength(1);
  });

  it("con el 4x1000 apagado en Configuración, el servidor lo ignora aunque llegue la casilla", async () => {
    const user = await signIn({ gmfEnabled: false });
    await createTransactionAction({ ok: false }, form({ ...expense, gmf: "on" }));
    expect(await activeTransactions(user.id)).toHaveLength(1);
  });

  it("un ingreso no tiene 4x1000", async () => {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...expense, type: "income", gmf: "on" }));
    expect((await activeTransactions(user.id)).map((row) => row.type)).toEqual(["income"]);
  });

  it("con un error en otro campo no guarda nada y la casilla vuelve marcada", async () => {
    const user = await signIn();
    const state = await createTransactionAction({ ok: false }, form({ ...expense, amount: "0", gmf: "on" }));
    expect(state).toMatchObject({ ok: false, values: { gmf: "on" } });
    expect(await activeTransactions(user.id)).toEqual([]);
  });

  it("en inglés, el aviso también lo dice", async () => {
    await signIn();
    requestLocale.value = "en";
    // En inglés, la coma separa los miles.
    expect(await createTransactionAction({ ok: false }, form({ ...expense, amount: "500,000", gmf: "on" }))).toMatchObject({
      message: "Expense and 4x1000 added",
    });
  });
});

describe("el 4x1000 atado a su egreso", () => {
  async function withGmf() {
    const user = await signIn();
    await createTransactionAction({ ok: false }, form({ ...expense, gmf: "on" }));
    const rows = await activeTransactions(user.id);
    const parent = rows.find((row) => row.taxOf === null)!;
    const tax = rows.find((row) => row.taxOf === parent.id)!;
    return { user, parent, tax };
  }

  it("al editar el egreso, se recalcula: el monto, la descripción y la fecha", async () => {
    const { user, parent, tax } = await withGmf();
    await expect(
      updateTransactionAction({ ok: false }, form({ ...expense, id: parent.id, amount: "1.250.000", description: "Arriendo nuevo", occurredOn: "2026-10-01" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    const [after] = await db.select().from(transaction).where(eq(transaction.id, tax.id));
    expect(after).toMatchObject({ amount: 5000, description: "4x1000 · Arriendo nuevo", occurredOn: "2026-10-01", userId: user.id, deletedAt: null });
  });

  it("al borrar el egreso, se va con él; al deshacer, vuelve con él", async () => {
    const { user, parent, tax } = await withGmf();
    await expect(deleteTransactionAction(form({ id: parent.id }))).rejects.toThrow("NEXT_REDIRECT");
    expect(await activeTransactions(user.id)).toEqual([]);

    await expect(restoreTransactionAction(form({ id: parent.id }))).rejects.toThrow("NEXT_REDIRECT");
    expect((await activeTransactions(user.id)).map((row) => row.id).sort()).toEqual([parent.id, tax.id].sort());
  });

  it("si el 4x1000 se había borrado aparte, al deshacer el borrado del egreso no vuelve", async () => {
    const { user, parent, tax } = await withGmf();
    await expect(deleteTransactionAction(form({ id: tax.id }))).rejects.toThrow("NEXT_REDIRECT");
    vi.setSystemTime(new Date("2026-10-20T17:01:00Z"));
    await expect(deleteTransactionAction(form({ id: parent.id }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(restoreTransactionAction(form({ id: parent.id }))).rejects.toThrow("NEXT_REDIRECT");
    expect((await activeTransactions(user.id)).map((row) => row.id)).toEqual([parent.id]);
    vi.setSystemTime(new Date("2026-10-20T17:00:00Z"));
  });

  it("solo la cuenta de la sesión: otra no le borra ni le cambia el 4x1000 a nadie", async () => {
    const ana = await withGmf();
    await signIn();
    await expect(deleteTransactionAction(form({ id: ana.parent.id }))).resolves.toBeUndefined();
    await expect(updateTransactionAction({ ok: false }, form({ ...expense, id: ana.parent.id, amount: "9.000.000" }))).resolves.toMatchObject({
      ok: false,
    });
    const [tax] = await db.select().from(transaction).where(eq(transaction.id, ana.tax.id));
    expect(tax).toMatchObject({ amount: 2000, deletedAt: null });
  });
});

describe("taxCategoryId (la categoría del 4x1000)", () => {
  it("si no existe, la crea una sola vez", async () => {
    await db.delete(category).where(and(isNull(category.userId), eq(category.name, "Impuestos")));
    const [first, second] = await Promise.all([taxCategoryId(), taxCategoryId()]);
    expect(first).toBe(second);
    expect(await taxCategory()).toHaveLength(1);
  });

  it("si el admin la había archivado, la restaura", async () => {
    const id = await taxCategoryId();
    await db.update(category).set({ archivedAt: new Date() }).where(eq(category.id, id));
    expect(await taxCategoryId()).toBe(id);
    const [row] = await db.select().from(category).where(eq(category.id, id));
    expect(row.archivedAt).toBeNull();
  });

  it("encuentra la que ya existía aunque la hayan escrito distinto", async () => {
    await db.delete(category).where(and(isNull(category.userId), eq(category.name, "Impuestos")));
    const [mine] = await db.insert(category).values({ type: "expense", name: "impuéstos", emoji: "🧾" }).returning();
    expect(await taxCategoryId()).toBe(mine.id);
  });
});

describe("addGmf", () => {
  it("uno por egreso: si ya lo tiene, no lo repite; menos de un centavo, no se registra", async () => {
    const user = await createUser();
    const [big, tiny] = await db
      .insert(transaction)
      .values([
        { userId: user.id, type: "expense", amount: 100000, description: "Mercado", occurredOn: "2026-10-01" },
        { userId: user.id, type: "expense", amount: 1, description: "Chicle", occurredOn: "2026-10-01" },
      ])
      .returning();
    const parents = [big, tiny].map((row) => ({ ...row, source: "web" as const }));
    expect((await addGmf(parents)).map((row) => row.amount)).toEqual([400]);
    expect(await addGmf(parents)).toEqual([]);
    expect(await activeTransactions(user.id)).toHaveLength(3);
  });
});

describe("saveGmfSettingAction (Configuración → 4x1000)", () => {
  it("lo apaga y lo prende, con su aviso, solo en la cuenta propia", async () => {
    const otra = await createUser();
    const user = await signIn();
    expect(await getGmfEnabled(user.id)).toBe(true);

    expect(await saveGmfSettingAction({}, form({}))).toEqual({ message: "Apagaste el 4x1000: ya no te lo ofrecemos ni te lo preguntamos.", tone: "removal" });
    expect(await getGmfEnabled(user.id)).toBe(false);
    expect(await getGmfEnabled(otra.id)).toBe(true);

    expect(await saveGmfSettingAction({}, form({ enabled: "on", userId: otra.id }))).toMatchObject({ tone: "success" });
    expect(await getGmfEnabled(user.id)).toBe(true);
    const [row] = await db.select({ enabled: userTable.gmfEnabled }).from(userTable).where(eq(userTable.id, otra.id));
    expect(row.enabled).toBe(true);
  });

  it("exige sesión", async () => {
    await expect(saveGmfSettingAction({}, form({ enabled: "on" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
