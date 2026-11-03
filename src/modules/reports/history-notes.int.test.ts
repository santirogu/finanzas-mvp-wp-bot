import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { fixedExpenseNote, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { refresh } from "next/cache";
import { createUser } from "../../../test/integration/factories";

// El historial de los gastos fijos: los totales de cada mes, las notas y su Server Action, contra la
// base de pruebas. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getExpenseHistoryMonths, getFixedNotes, noteKey, saveFixedNote } = await import("./history-notes");
const { saveFixedNoteAction } = await import("./actions");

type NewTx = Partial<typeof transaction.$inferInsert> & { userId: string };
const addTx = (tx: NewTx) =>
  db.insert(transaction).values({ type: "expense", amount: 1000, description: "Netflix", occurredOn: "2026-10-05", ...tx });
const notesOf = (userId: string) =>
  db
    .select({ key: fixedExpenseNote.descriptionKey, month: fixedExpenseNote.month, note: fixedExpenseNote.note })
    .from(fixedExpenseNote)
    .where(eq(fixedExpenseNote.userId, userId));
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

describe("getExpenseHistoryMonths", () => {
  it("los egresos de cada mes por descripción, en todo el tiempo, con la última escritura y el primer pago", async () => {
    const user = await createUser();
    const other = await createUser();
    await addTx({ userId: user.id, description: "netflix ", amount: 20000, occurredOn: "2024-03-20" });
    await addTx({ userId: user.id, description: "  Netflix", amount: 24900.5, occurredOn: "2024-03-02" });
    await addTx({ userId: user.id, description: "NETFLIX", amount: 44900, occurredOn: "2026-10-05" });
    // No cuentan: un ingreso, uno borrado y los de otra cuenta.
    await addTx({ userId: user.id, type: "income", description: "Netflix", amount: 5, occurredOn: "2026-10-05" });
    await addTx({ userId: user.id, amount: 7, occurredOn: "2026-10-06", deletedAt: new Date() });
    await addTx({ userId: other.id, amount: 99999, occurredOn: "2026-10-05" });

    const rows = await getExpenseHistoryMonths(user.id);
    expect(rows.sort((a, b) => a.month.localeCompare(b.month))).toEqual([
      { month: "2024-03", description: "netflix", total: 44900.5, first: "2024-03-02", last: "2024-03-20" },
      { month: "2026-10", description: "NETFLIX", total: 44900, first: "2026-10-05", last: "2026-10-05" },
    ]);
  });
});

describe("saveFixedNote", () => {
  it("guarda la nota de un mes en que pagó ese gasto (con la clave sin mayúsculas ni tildes) y avisa en verde", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, description: "Suscripción Música", occurredOn: "2026-03-07" });
    expect(await saveFixedNote(user.id, { description: "Suscripción Música", month: "2026-03", note: "  Subió el plan familiar " })).toEqual({
      ok: true,
      message: "Se guardó la nota",
      tone: "success",
    });
    expect(await notesOf(user.id)).toEqual([{ key: "suscripcion musica", month: "2026-03", note: "Subió el plan familiar" }]);
  });

  it("editarla la cambia (no la repite) y vaciarla la borra, en rojo", async () => {
    const user = await createUser();
    await addTx({ userId: user.id });
    await saveFixedNote(user.id, { description: "Netflix", month: "2026-10", note: "Primera" });
    await saveFixedNote(user.id, { description: "netflix", month: "2026-10", note: "Segunda" });
    expect(await notesOf(user.id)).toEqual([{ key: "netflix", month: "2026-10", note: "Segunda" }]);

    expect(await saveFixedNote(user.id, { description: "Netflix", month: "2026-10", note: "   " })).toEqual({
      ok: true,
      message: "Se borró la nota",
      tone: "removal",
    });
    expect(await notesOf(user.id)).toEqual([]);
  });

  it("solo en un mes en que pagó ese gasto: no en otro mes, ni uno borrado, ni un ingreso, ni de otra cuenta", async () => {
    const user = await createUser();
    const other = await createUser();
    await addTx({ userId: user.id, description: "Netflix", occurredOn: "2026-10-05" });
    await addTx({ userId: user.id, description: "Borrado", occurredOn: "2026-10-05", deletedAt: new Date() });
    await addTx({ userId: user.id, type: "income", description: "Salario", occurredOn: "2026-10-05" });
    await addTx({ userId: other.id, description: "Arriendo de Beto", occurredOn: "2026-10-05" });
    for (const [description, month] of [
      ["Netflix", "2026-09"],
      ["Netflix", "2026-11"],
      ["Borrado", "2026-10"],
      ["Salario", "2026-10"],
      ["Arriendo de Beto", "2026-10"],
    ]) {
      expect(await saveFixedNote(user.id, { description, month, note: "Hola" })).toEqual({ ok: false, error: "No se pudo guardar la nota. Intenta de nuevo." });
    }
    expect(await notesOf(user.id)).toEqual([]);
  });

  it("encuentra el gasto del mes aunque esté escrito con otras tildes, mayúsculas o espacios", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, description: " suscripcion  musica", occurredOn: "2026-03-31" });
    expect((await saveFixedNote(user.id, { description: "Suscripción Música", month: "2026-03", note: "Ok" })).ok).toBe(true);
  });

  it("no toca las notas de otra cuenta, ni al editar ni al borrar", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await addTx({ userId: ana.id });
    await addTx({ userId: beto.id });
    await saveFixedNote(beto.id, { description: "Netflix", month: "2026-10", note: "La de Beto" });
    await saveFixedNote(ana.id, { description: "Netflix", month: "2026-10", note: "La de Ana" });
    await saveFixedNote(ana.id, { description: "Netflix", month: "2026-10", note: "" });
    expect(await notesOf(beto.id)).toEqual([{ key: "netflix", month: "2026-10", note: "La de Beto" }]);
    expect(await getFixedNotes(ana.id)).toEqual(new Map());
  });

  it("una nota de más de 280 caracteres no se guarda y el error va en su campo", async () => {
    const user = await createUser();
    await addTx({ userId: user.id });
    expect(await saveFixedNote(user.id, { description: "Netflix", month: "2026-10", note: "x".repeat(281) })).toEqual({
      ok: false,
      field: "note",
      error: "Máximo 280 caracteres.",
    });
    // 280 justos, sí (los espacios de los extremos no cuentan).
    expect((await saveFixedNote(user.id, { description: "Netflix", month: "2026-10", note: ` ${"x".repeat(280)} ` })).ok).toBe(true);
  });

  it.each([
    [{ description: "", month: "2026-10", note: "Hola" }],
    [{ description: "   ", month: "2026-10", note: "Hola" }],
    [{ description: "x".repeat(141), month: "2026-10", note: "Hola" }],
    [{ description: "Netflix", month: "2026-13", note: "Hola" }],
    [{ description: "Netflix", month: "octubre", note: "Hola" }],
    [{ description: "Netflix", month: "2026-10", note: null }],
    [{ description: null, month: "2026-10", note: "Hola" }],
  ])("con algo mal (%j) no guarda nada", async (raw) => {
    const user = await createUser();
    await addTx({ userId: user.id });
    expect(await saveFixedNote(user.id, raw)).toEqual({ ok: false, error: "No se pudo guardar la nota. Intenta de nuevo." });
    expect(await notesOf(user.id)).toEqual([]);
  });
});

describe("getFixedNotes", () => {
  it("las notas de esa cuenta, por gasto y mes", async () => {
    const user = await createUser();
    const other = await createUser();
    await db.insert(fixedExpenseNote).values([
      { userId: user.id, descriptionKey: "netflix", month: "2026-03", note: "Subió" },
      { userId: user.id, descriptionKey: "netflix", month: "2025-06", note: "Otra" },
      { userId: other.id, descriptionKey: "netflix", month: "2026-03", note: "Ajena" },
    ]);
    expect(await getFixedNotes(user.id)).toEqual(
      new Map([
        [noteKey("netflix", "2026-03"), "Subió"],
        [noteKey("netflix", "2025-06"), "Otra"],
      ]),
    );
  });

  it("la base no acepta una nota vacía, más larga que el límite ni un mes inválido", async () => {
    const user = await createUser();
    for (const values of [
      { note: "" },
      { note: "x".repeat(281) },
      { month: "2026-13" },
      { month: "2026-1" },
    ]) {
      await expect(
        db.insert(fixedExpenseNote).values({ userId: user.id, descriptionKey: "netflix", month: "2026-03", note: "Hola", ...values }),
      ).rejects.toThrow();
    }
  });
});

describe("saveFixedNoteAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(saveFixedNoteAction({}, form({ description: "Netflix", month: "2026-10", note: "Hola" }))).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
  });

  it("guarda la nota de quien tiene la sesión, refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    await addTx({ userId: user.id });
    expect(await saveFixedNoteAction({}, form({ description: "Netflix", month: "2026-10", note: "Subió" }))).toEqual({
      message: "Se guardó la nota",
      tone: "success",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await notesOf(user.id)).toEqual([{ key: "netflix", month: "2026-10", note: "Subió" }]);
  });

  it("con un error lo devuelve (con su campo) y no refresca", async () => {
    const user = await signIn();
    await addTx({ userId: user.id });
    expect(await saveFixedNoteAction({}, form({ description: "Netflix", month: "2026-10", note: "x".repeat(281) }))).toEqual({
      error: "Máximo 280 caracteres.",
      field: "note",
    });
    expect(await saveFixedNoteAction({}, form({ description: "Netflix", month: "2026-09", note: "Hola" }))).toEqual({
      error: "No se pudo guardar la nota. Intenta de nuevo.",
    });
    expect(await notesOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("saveFixedNote · en inglés", () => {
  it("los avisos y los errores, en inglés", async () => {
    const { id } = await createUser();
    await addTx({ userId: id });
    expect(await saveFixedNote(id, { description: "Netflix", month: "2026-10", note: "Subió" }, "en")).toEqual({ ok: true, message: "The note was saved", tone: "success" });
    expect(await saveFixedNote(id, { description: "Netflix", month: "2026-10", note: "" }, "en")).toEqual({ ok: true, message: "The note was deleted", tone: "removal" });
    expect(await saveFixedNote(id, { description: "Netflix", month: "2026-09", note: "x" }, "en")).toEqual({ ok: false, error: "The note couldn't be saved. Try again." });
    expect(await saveFixedNote(id, { description: "Netflix", month: "2026-10", note: "x".repeat(1000) }, "en")).toMatchObject({ ok: false, field: "note", error: expect.stringMatching(/^At most \d+ characters\.$/) });
  });
});
