import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, loginFailure, session } from "@/db/schema";
import { ACCOUNT_LOCKED } from "@/lib/auth-errors";
import { LOCKOUT } from "@/modules/auth/lockout";
import {
  adminWithTwoFactor,
  PASSWORD,
  register,
  sessionOf,
  signIn,
  type Jar,
} from "../../../test/integration/auth-http";
import { requestLocale } from "../../../test/integration/locale";
import { totp } from "../../../test/totp";

// "Cambiar contraseña" (Mi cuenta) con Better Auth y sesiones de verdad: la contraseña cambia, las
// otras sesiones se cierran, la de quien la cambió sigue y queda en el historial.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { changePasswordAction } = await import("./actions");

const NEW_PASSWORD = "otra-clave-segura-456";
const as = (jar: Jar) => {
  request.cookie = jar.header();
};
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const change = (values: Record<string, string>) => changePasswordAction({}, form(values));
const valid = { current: PASSWORD, next: NEW_PASSWORD, repeat: NEW_PASSWORD };
const eventsOf = (userId: string) => db.select({ type: accountEvent.type }).from(accountEvent).where(eq(accountEvent.userId, userId));
const loginWorks = async (email: string, password: string) => (await signIn(email, password)).response.status === 200;
const userIdOf = async (jar: Jar) => (await sessionOf(jar))!.user.id;

beforeEach(() => {
  request.cookie = "";
});

describe("changePasswordAction", () => {
  it("sin sesión lleva al login", async () => {
    await expect(change(valid)).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("con la actual correcta la cambia, cierra las sesiones viejas y queda en el historial", async () => {
    const here = await register("ana@test.local");
    const id = await userIdOf(here);
    // Otra sesión de la misma cuenta (otro dispositivo, o alguien que sabía la contraseña).
    const other = (await signIn("ana@test.local")).jar;
    as(here);

    expect(await change(valid)).toEqual({ ok: true });

    expect(await loginWorks("ana@test.local", NEW_PASSWORD)).toBe(true);
    expect(await loginWorks("ana@test.local", PASSWORD)).toBe(false);
    expect(await sessionOf(other)).toBeNull();
    expect(await eventsOf(id)).toContainEqual({ type: "password_changed" });
  });

  it("no toca la contraseña ni las sesiones de otras cuentas", async () => {
    const here = await register("ana@test.local");
    const beto = await register("beto@test.local");
    as(here);
    await change(valid);
    expect(await sessionOf(beto)).not.toBeNull();
    expect(await loginWorks("beto@test.local", PASSWORD)).toBe(true);
  });

  it("con la actual equivocada no cambia nada y cuenta como intento fallido", async () => {
    const here = await register("ana@test.local");
    as(here);
    expect(await change({ ...valid, current: "no-es-la-clave" })).toEqual({ fieldErrors: { current: "Contraseña incorrecta." } });
    const [failure] = await db.select().from(loginFailure).where(eq(loginFailure.email, "ana@test.local"));
    expect(failure.failures).toBe(1);
    expect(await sessionOf(here)).not.toBeNull();
    expect(await loginWorks("ana@test.local", PASSWORD)).toBe(true);
  });

  it(`tras ${LOCKOUT.maxFailures} contraseñas equivocadas queda bloqueada, aunque después llegue la correcta`, async () => {
    const here = await register("ana@test.local");
    as(here);
    for (let i = 0; i < LOCKOUT.maxFailures; i++) await change({ ...valid, current: `equivocada-${i}` });
    expect(await change(valid)).toEqual({ error: ACCOUNT_LOCKED });
  });

  it("revisa los campos antes de mirar la cuenta (sin gastar intentos)", async () => {
    const here = await register("ana@test.local");
    as(here);
    expect(await change({ current: "", next: "corta", repeat: "corta" })).toEqual({
      fieldErrors: { current: "Escribe tu contraseña actual.", next: "Debe tener al menos 8 caracteres." },
    });
    expect(await change({ ...valid, repeat: "otra-distinta-789" })).toEqual({
      fieldErrors: { repeat: "No coincide con la contraseña nueva." },
    });
    expect(await change({ ...valid, next: PASSWORD, repeat: PASSWORD })).toEqual({
      fieldErrors: { next: "Debe ser distinta de la actual." },
    });
    expect(await db.select().from(loginFailure)).toEqual([]);
  });

  describe("un admin con la verificación en dos pasos", () => {
    it("sin su código no la cambia", async () => {
      const { jar } = await adminWithTwoFactor("ana@test.local");
      as(jar);
      expect(await change(valid)).toEqual({
        fieldErrors: { code: "Escribe los 6 dígitos del código de Google Authenticator." },
      });
      expect(await loginWorks("ana@test.local", NEW_PASSWORD)).toBe(false);
    });

    it("con un código equivocado tampoco", async () => {
      const { jar, secret } = await adminWithTwoFactor("ana@test.local");
      as(jar);
      const wrong = String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, "0");
      const result = await change({ ...valid, code: wrong });
      expect(result.fieldErrors?.code).toMatch(/^El código no es correcto/);
      // La contraseña sigue siendo la de antes y no queda en el historial como cambiada.
      expect(await eventsOf(await userIdOf(jar))).not.toContainEqual({ type: "password_changed" });
      expect(await loginWorks("ana@test.local", NEW_PASSWORD)).toBe(false);
    });

    it("con su código, sí", async () => {
      const { jar, secret } = await adminWithTwoFactor("ana@test.local");
      as(jar);
      expect(await change({ ...valid, code: totp(secret) })).toEqual({ ok: true });
      // El segundo paso del login sigue: la contraseña nueva pide el código.
      const login = await signIn("ana@test.local", NEW_PASSWORD);
      expect(login.body).toMatchObject({ twoFactorRedirect: true });
    });
  });

  it("la sesión de quien la cambió sigue abierta, y es la única", async () => {
    const here = await register("ana@test.local");
    const id = await userIdOf(here);
    await signIn("ana@test.local");
    as(here);
    await change(valid);
    expect(await sessionOf(here)).not.toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, id))).toHaveLength(1);
  });
});

describe("changePasswordAction · en inglés", () => {
  it("los errores de los campos y la contraseña equivocada, en inglés", async () => {
    const here = await register("ana@test.local");
    as(here);
    requestLocale.value = "en";

    expect(await change({ current: "", next: "corta", repeat: "otra" })).toEqual({
      fieldErrors: { current: "Enter your current password.", next: "It must have at least 8 characters." },
    });
    expect(await change({ current: PASSWORD, next: NEW_PASSWORD, repeat: "otra" })).toEqual({ fieldErrors: { repeat: "It doesn't match the new password." } });
    expect(await change({ ...valid, current: "no-es-la-mia-123" })).toEqual({ fieldErrors: { current: "Wrong password." } });
    expect(await change(valid)).toEqual({ ok: true });
  });
});
