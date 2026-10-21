import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { PASSWORD, adminWithTwoFactor, json, post, register, signIn, updateUserFromServer } from "../../test/integration/auth-http";
import { totp } from "../../test/totp";

// El idioma que eligió en Mi cuenta (user.locale) viaja con la cuenta: el navegador donde inicia sesión
// recibe la cookie `idioma` (src/lib/auth.ts). Por HTTP, como un navegador.

const setLocale = (email: string, locale: string | null) => db.update(user).set({ locale }).where(eq(user.email, email));
const localeCookie = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith("idioma="));

describe("el idioma de la cuenta al iniciar sesión", () => {
  it("con el idioma elegido, el navegador donde entra lo recibe: por un año y solo para el servidor", async () => {
    await register("ana@test.local");
    await setLocale("ana@test.local", "en");
    const { response } = await signIn("ana@test.local");
    expect(response.status).toBe(200);
    const cookie = localeCookie(response)!;
    expect(cookie).toMatch(/^idioma=en;/);
    expect(cookie).toMatch(/Max-Age=31536000/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("sin idioma elegido no le pone ninguno: sigue el de su navegador", async () => {
    const jar = await register("beto@test.local");
    expect(jar.has("idioma")).toBe(false);
    expect(localeCookie((await signIn("beto@test.local")).response)).toBeUndefined();
  });

  it("con la contraseña equivocada no le pone nada", async () => {
    await register("carla@test.local");
    await setLocale("carla@test.local", "en");
    const { response } = await signIn("carla@test.local", "otra-clave-123");
    expect(response.status).toBe(401);
    expect(localeCookie(response)).toBeUndefined();
  });

  it("un admin lo recibe al terminar el segundo paso, no con la contraseña sola", async () => {
    const { secret } = await adminWithTwoFactor("admin@test.local");
    await setLocale("admin@test.local", "en");
    const { jar, body, response } = await signIn("admin@test.local");
    expect(body.twoFactorRedirect).toBe(true);
    expect(localeCookie(response)).toBeUndefined();
    const verified = await post("/two-factor/verify-totp", { code: totp(secret) }, jar);
    expect(verified.status).toBe(200);
    expect(localeCookie(verified)).toMatch(/^idioma=en;/);
  });
});

describe("solo Mi cuenta cambia el idioma de la cuenta", () => {
  it("el registro y 'actualizar perfil' rechazan el que mande el cliente (input: false)", async () => {
    const withLocale = await post("/sign-up/email", { name: "Dani", email: "dani@test.local", password: PASSWORD, locale: "en" });
    expect(withLocale.status).toBe(400);
    expect(await json(withLocale)).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    expect(await db.select().from(user).where(eq(user.email, "dani@test.local"))).toEqual([]);

    const jar = await register("dani@test.local");
    expect(await updateUserFromServer({ locale: "en" }, jar)).toMatchObject({ status: 400 });
    expect((await db.select({ locale: user.locale }).from(user).where(eq(user.email, "dani@test.local")))[0].locale).toBeNull();
  });

  it("la base solo acepta los idiomas de la app", async () => {
    await register("eva@test.local");
    await expect(setLocale("eva@test.local", "fr")).rejects.toThrow();
    await setLocale("eva@test.local", "es");
    await setLocale("eva@test.local", null);
  });
});
