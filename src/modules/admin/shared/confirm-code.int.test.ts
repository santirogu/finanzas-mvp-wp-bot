import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { adminCodeUse, twoFactor } from "@/db/schema";
import { requestLocale } from "../../../../test/integration/locale";
import { createAdminWithTwoFactor } from "../../../../test/integration/two-factor";

// La confirmación de las acciones del admin con el código de Google Authenticator, con la base de
// verdad y la clave cifrada como la guarda Better Auth. La sesión se simula: por defecto, la del
// admin de cada prueba.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const { confirmAdminCode } = await import("./confirm-code");

// 12 de octubre de 2026, 4:00:10 p. m. en Colombia (a los 10 s de un período de 30 s).
const NOW = new Date("2026-10-12T21:00:10Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

async function adminReady() {
  const ready = await createAdminWithTwoFactor();
  auth.requireAdmin.mockResolvedValue({ id: ready.admin.id, role: "admin", twoFactorEnabled: true });
  return ready;
}

const factorOf = (userId: string) =>
  db
    .select({ failures: twoFactor.failedVerificationCount, lockedUntil: twoFactor.lockedUntil })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId))
    .then((rows) => rows[0]);

/** Un código de 6 dígitos que no es el de ninguno de los tres períodos que se aceptan. */
function wrongCode(codeAt: (now: Date) => string, now = NOW) {
  const valid = new Set([-30, 0, 30].map((s) => codeAt(new Date(now.getTime() + s * 1000))));
  return ["000000", "111111", "222222", "333333"].find((code) => !valid.has(code))!;
}

beforeEach(() => {
  auth.requireAdmin.mockReset();
});

describe("confirmAdminCode", () => {
  it("acepta el código de ahora (también con espacios) y deja el contador en cero", async () => {
    const { admin, codeAt } = await adminReady();
    await db.update(twoFactor).set({ failedVerificationCount: 3 }).where(eq(twoFactor.userId, admin.id));

    const code = codeAt(NOW);
    expect(await confirmAdminCode(`${code.slice(0, 3)} ${code.slice(3)}`, NOW)).toEqual({ ok: true });
    expect(await factorOf(admin.id)).toEqual({ failures: 0, lockedUntil: null });
  });

  it("acepta el del período anterior y el del siguiente (relojes un poco corridos)", async () => {
    const first = await adminReady();
    expect(await confirmAdminCode(first.codeAt(later(-30)), NOW)).toEqual({ ok: true });
    const second = await adminReady();
    expect(await confirmAdminCode(second.codeAt(later(30)), NOW)).toEqual({ ok: true });
  });

  it("rechaza uno de hace más de un período", async () => {
    const { codeAt } = await adminReady();
    expect(await confirmAdminCode(codeAt(later(-60)), NOW)).toMatchObject({ ok: false });
  });

  it("cada código equivocado dice cuántos intentos quedan; al quinto, bloquea por 15 minutos", async () => {
    const { admin, codeAt } = await adminReady();
    const wrong = wrongCode(codeAt);
    const errors = [];
    for (let i = 0; i < 4; i++) errors.push((await confirmAdminCode(wrong, NOW)) as { error: string });
    expect(errors.map((r) => r.error)).toEqual([
      "El código no es correcto. Te quedan 4 intentos.",
      "El código no es correcto. Te quedan 3 intentos.",
      "El código no es correcto. Te quedan 2 intentos.",
      "El código no es correcto. Te queda 1 intento.",
    ]);
    expect(await confirmAdminCode(wrong, NOW)).toEqual({
      ok: false,
      error:
        "El código no es correcto. Por demasiados códigos equivocados, las acciones y tu inicio de sesión están bloqueados hasta las 4:15 p. m.",
    });
    // Las mismas columnas que usa Better Auth al iniciar sesión: también bloquea el inicio de sesión.
    expect(await factorOf(admin.id)).toEqual({ failures: 5, lockedUntil: later(15 * 60) });
  });

  it("bloqueado, rechaza hasta el código correcto (sin contarlo); al pasar el bloqueo, cuenta de cero", async () => {
    const { admin, codeAt } = await adminReady();
    await db
      .update(twoFactor)
      .set({ failedVerificationCount: 5, lockedUntil: later(60) })
      .where(eq(twoFactor.userId, admin.id));

    expect(await confirmAdminCode(codeAt(NOW), NOW)).toEqual({
      ok: false,
      error: "Por demasiados códigos equivocados, las acciones y tu inicio de sesión están bloqueados hasta las 4:01 p. m.",
    });
    expect(await factorOf(admin.id)).toEqual({ failures: 5, lockedUntil: later(60) });

    // Dos minutos después ya pasó: un error cuenta como el primero.
    const after = later(120);
    expect(await confirmAdminCode(wrongCode(codeAt, after), after)).toMatchObject({ error: "El código no es correcto. Te quedan 4 intentos." });
    expect(await factorOf(admin.id)).toEqual({ failures: 1, lockedUntil: null });
    expect(await confirmAdminCode(codeAt(after), after)).toEqual({ ok: true });
  });

  it("un código sirve una sola vez, y tampoco uno anterior al último usado", async () => {
    const { admin, codeAt } = await adminReady();
    expect(await confirmAdminCode(codeAt(NOW), NOW)).toEqual({ ok: true });
    const reused = { ok: false, error: "Ese código ya se usó. Espera el siguiente en Google Authenticator." };
    expect(await confirmAdminCode(codeAt(NOW), later(5))).toEqual(reused);
    // El siguiente sí; después, el de antes ya no (aunque siga dentro de la ventana).
    expect(await confirmAdminCode(codeAt(later(30)), later(30))).toEqual({ ok: true });
    expect(await confirmAdminCode(codeAt(NOW), later(30))).toEqual(reused);
    // Reusar no cuenta como código equivocado.
    expect((await factorOf(admin.id)).failures).toBe(0);
    expect(await db.select({ lastStep: adminCodeUse.lastStep }).from(adminCodeUse)).toEqual([
      { lastStep: Math.floor(later(30).getTime() / 30_000) },
    ]);
  });

  it("si llegan dos confirmaciones a la vez con el mismo código, pasa una sola", async () => {
    const { codeAt } = await adminReady();
    const code = codeAt(NOW);
    const results = await Promise.all(Array.from({ length: 5 }, () => confirmAdminCode(code, NOW)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it.each(["", "12345", "1234567", "abcdef", "12-345"])("algo que no es un código (%j) se rechaza sin contar como intento", async (code) => {
    const { admin } = await adminReady();
    expect(await confirmAdminCode(code, NOW)).toEqual({
      ok: false,
      error: "Escribe los 6 dígitos del código de Google Authenticator.",
    });
    expect((await factorOf(admin.id)).failures).toBe(0);
  });

  it("solo sirve el código del admin de la sesión, no el de otro", async () => {
    const other = await createAdminWithTwoFactor({ name: "Otro Admin" });
    const { admin } = await adminReady();
    const code = other.codeAt(NOW);
    expect(await confirmAdminCode(code, NOW)).toMatchObject({ ok: false });
    expect((await factorOf(admin.id)).failures).toBe(1);
    expect((await factorOf(other.admin.id)).failures).toBe(0);
  });

  it("sin la verificación confirmada no hay código que valga", async () => {
    const { admin, codeAt } = await adminReady();
    await db.update(twoFactor).set({ verified: false }).where(eq(twoFactor.userId, admin.id));
    expect(await confirmAdminCode(codeAt(NOW), NOW)).toEqual({ ok: false, error: "Tu verificación en dos pasos no está configurada." });
  });

  it.each([
    ["sin sesión", new Error("NEXT_REDIRECT:/login")],
    ["un usuario", new Error("NEXT_NOT_FOUND")],
    ["un admin sin verificación", new Error("NEXT_REDIRECT:/admin/seguridad")],
  ])("%s: falla antes de mirar el código", async (_, error) => {
    const { admin, codeAt } = await createAdminWithTwoFactor();
    auth.requireAdmin.mockRejectedValue(error);
    await expect(confirmAdminCode(codeAt(NOW), NOW)).rejects.toThrow(error.message);
    await expect(confirmAdminCode("000000", NOW)).rejects.toThrow(error.message);
    expect(await factorOf(admin.id)).toEqual({ failures: 0, lockedUntil: null });
    expect(await db.$count(adminCodeUse)).toBe(0);
  });
});

describe("confirmAdminCode en inglés (el idioma de quien hace el pedido)", () => {
  beforeEach(() => {
    requestLocale.value = "en";
  });

  it("los intentos que quedan y el bloqueo, con la hora como en Estados Unidos", async () => {
    const { codeAt } = await adminReady();
    const wrong = wrongCode(codeAt);
    const errors = [];
    for (let i = 0; i < 4; i++) errors.push(((await confirmAdminCode(wrong, NOW)) as { error: string }).error);
    expect(errors).toEqual([
      "The code isn't right. You have 4 attempts left.",
      "The code isn't right. You have 3 attempts left.",
      "The code isn't right. You have 2 attempts left.",
      "The code isn't right. You have 1 attempt left.",
    ]);
    expect(await confirmAdminCode(wrong, NOW)).toEqual({
      ok: false,
      error: "The code isn't right. Because of too many wrong codes, actions and your sign-in are locked until 4:15 PM.",
    });
    expect(await confirmAdminCode(codeAt(NOW), NOW)).toEqual({
      ok: false,
      error: "Because of too many wrong codes, actions and your sign-in are locked until 4:15 PM.",
    });
  });

  it("un código ya usado y uno sin formato", async () => {
    const { codeAt } = await adminReady();
    expect(await confirmAdminCode(codeAt(NOW), NOW)).toEqual({ ok: true });
    expect(await confirmAdminCode(codeAt(NOW), later(5))).toEqual({
      ok: false,
      error: "That code was already used. Wait for the next one in Google Authenticator.",
    });
    expect(await confirmAdminCode("12-345", NOW)).toEqual({ ok: false, error: "Enter the 6 digits of the Google Authenticator code." });
  });
});
