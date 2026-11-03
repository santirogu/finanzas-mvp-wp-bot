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

const setTheme = (email: string, theme: string | null) => db.update(user).set({ theme }).where(eq(user.email, email));
const themeCookie = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith("tema="));

describe("la apariencia de la cuenta al iniciar sesión", () => {
  it("con una elegida, el navegador donde entra la recibe: por un año y legible por el script (sin HttpOnly)", async () => {
    await register("fede@test.local");
    await setTheme("fede@test.local", "dark");
    const cookie = themeCookie((await signIn("fede@test.local")).response)!;
    expect(cookie).toMatch(/^tema=dark;/);
    expect(cookie).toMatch(/Max-Age=31536000/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/HttpOnly/i);
  });

  it("sin elegir no le pone ninguna: queda la de ese navegador", async () => {
    await register("gabi@test.local");
    expect(themeCookie((await signIn("gabi@test.local")).response)).toBeUndefined();
  });

  it("un admin la recibe al terminar el segundo paso, no con la contraseña sola", async () => {
    const { secret } = await adminWithTwoFactor("admin2@test.local");
    await setTheme("admin2@test.local", "light");
    const { jar, response } = await signIn("admin2@test.local");
    expect(themeCookie(response)).toBeUndefined();
    const verified = await post("/two-factor/verify-totp", { code: totp(secret) }, jar);
    expect(themeCookie(verified)).toMatch(/^tema=light;/);
  });

  it("solo Mi cuenta la cambia (input: false) y la base solo acepta las de la app", async () => {
    const jar = await register("hugo@test.local");
    expect(await updateUserFromServer({ theme: "dark" }, jar)).toMatchObject({ status: 400 });
    await expect(setTheme("hugo@test.local", "azul")).rejects.toThrow();
    await setTheme("hugo@test.local", "system");
    await setTheme("hugo@test.local", null);
  });
});
