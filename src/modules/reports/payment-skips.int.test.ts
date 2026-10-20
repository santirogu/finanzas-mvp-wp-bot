import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { fixedPaymentSkip, transaction } from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createUser } from "../../../test/integration/factories";
import { requestLocale } from "../../../test/integration/locale";

// "Este pago ya no aplica" (los avisos de próximos pagos): la capa de datos y su Server Action, contra la
// base de pruebas, con dos usuarios. La sesión y el refresco de la página se simulan.
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => {
    if (!session.current) throw new Error("NEXT_REDIRECT /login");
    return session.current;
  }),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { getPaymentSkips, skipFixedPayment } = await import("./payment-skips");
const { skipFixedPaymentAction } = await import("./actions");

const addExpense = (userId: string, description: string, deletedAt: Date | null = null) =>
  db.insert(transaction).values({ userId, type: "expense", amount: 1000, description, occurredOn: "2026-09-05", deletedAt });
const skipsOf = (userId: string) =>
  db.select({ key: fixedPaymentSkip.descriptionKey, month: fixedPaymentSkip.month }).from(fixedPaymentSkip).where(eq(fixedPaymentSkip.userId, userId));
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

describe("skipFixedPayment", () => {
  it("oculta el pago de ese mes de uno de sus gastos (con la clave sin mayúsculas ni tildes) y avisa en rojo", async () => {
    const user = await createUser();
    await addExpense(user.id, "Administración Edificio");
    expect(await skipFixedPayment(user.id, { description: "Administración Edificio", month: "2026-10" })).toEqual({
      ok: true,
      message: "No se avisará del pago de octubre de «Administración Edificio»",
      tone: "removal",
    });
    expect(await skipsOf(user.id)).toEqual([{ key: "administracion edificio", month: "2026-10" }]);
    expect(await getPaymentSkips(user.id)).toEqual(new Set(["administracion edificio 2026-10"]));
  });

  it("marcarlo dos veces no hace nada más; otro mes es otra marca", async () => {
    const user = await createUser();
    await addExpense(user.id, "Arriendo");
    await skipFixedPayment(user.id, { description: "Arriendo", month: "2026-10" });
    expect((await skipFixedPayment(user.id, { description: "arriendo", month: "2026-10" })).ok).toBe(true);
    await skipFixedPayment(user.id, { description: "Arriendo", month: "2026-09" });
    expect(await getPaymentSkips(user.id)).toEqual(new Set(["arriendo 2026-10", "arriendo 2026-09"]));
  });

  it.each([
    [{ description: "", month: "2026-10" }],
    [{ description: "Arriendo", month: "octubre" }],
    [{ description: "Arriendo", month: "2026-13" }],
    [{ description: "x".repeat(141), month: "2026-10" }],
    [{ description: null, month: null }],
  ])("con datos inválidos (%j) no guarda nada", async (raw) => {
    const user = await createUser();
    await addExpense(user.id, "Arriendo");
    expect(await skipFixedPayment(user.id, raw)).toEqual({ ok: false, error: "No se pudo ocultar el aviso." });
    expect(await skipsOf(user.id)).toEqual([]);
  });

  it("solo de un gasto propio y no eliminado: el de otra cuenta no se puede marcar", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await addExpense(beto.id, "Gimnasio");
    await addExpense(ana.id, "Borrado", new Date());
    expect((await skipFixedPayment(ana.id, { description: "Gimnasio", month: "2026-10" })).ok).toBe(false);
    expect((await skipFixedPayment(ana.id, { description: "Borrado", month: "2026-10" })).ok).toBe(false);
    expect(await skipsOf(ana.id)).toEqual([]);
  });

  it("las marcas de una cuenta no le cambian nada a otra", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await addExpense(beto.id, "Arriendo");
    await skipFixedPayment(beto.id, { description: "Arriendo", month: "2026-10" });
    expect(await getPaymentSkips(ana.id)).toEqual(new Set());
  });
});

describe("skipFixedPaymentAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(skipFixedPaymentAction({}, form({ description: "Arriendo", month: "2026-10" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("marca el pago de quien tiene la sesión, refresca la página y devuelve el aviso", async () => {
    const user = await signIn();
    await addExpense(user.id, "Arriendo");
    expect(await skipFixedPaymentAction({}, form({ description: "Arriendo", month: "2026-10" }))).toEqual({
      message: "No se avisará del pago de octubre de «Arriendo»",
      tone: "removal",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await skipsOf(user.id)).toEqual([{ key: "arriendo", month: "2026-10" }]);
  });

  it("con un error lo devuelve, no guarda nada y no refresca", async () => {
    const user = await signIn();
    expect(await skipFixedPaymentAction({}, form({ description: "Inventado", month: "2026-10" }))).toEqual({ error: "No se pudo ocultar el aviso." });
    expect(await skipsOf(user.id)).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("skipFixedPaymentAction · en inglés", () => {
  it("el aviso y el error, en el idioma de la página", async () => {
    const user = await signIn();
    await addExpense(user.id, "Arriendo");
    requestLocale.value = "en";
    expect(await skipFixedPaymentAction({}, form({ description: "Arriendo", month: "2026-10" }))).toEqual({
      message: "You won't be notified of the October payment of “Arriendo”",
      tone: "removal",
    });
    expect(await skipFixedPaymentAction({}, form({ description: "Otro", month: "2026-10" }))).toEqual({ error: "The notice couldn't be hidden." });
  });
});
