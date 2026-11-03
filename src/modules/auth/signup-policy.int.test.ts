import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { appSetting, signupInvite, user } from "@/db/schema";
import { json, PASSWORD, post } from "../../../test/integration/auth-http";
import { checkSignup, getSignupMode, markInviteUsed } from "./signup-policy";

// Quién puede crear una cuenta (Configuración del admin): la política con la base de verdad y el registro por
// HTTP, como lo haría un navegador o alguien con curl (el hook de src/lib/auth.ts).

const setMode = (signupMode: "open" | "closed" | "invite") => db.insert(appSetting).values({ id: 1, signupMode });
const invite = (email: string) => db.insert(signupInvite).values({ email });
const accounts = () => db.select({ email: user.email }).from(user);
const invites = () => db.select({ email: signupInvite.email, usedAt: signupInvite.usedAt }).from(signupInvite);

describe("la política de registro", () => {
  it("sin elegir, los registros están abiertos", async () => {
    expect(await getSignupMode()).toBe("open");
    expect(await checkSignup("ana@test.local")).toEqual({ ok: true });
  });

  it("cerrados, nadie puede, ni con invitación", async () => {
    await setMode("closed");
    await invite("ana@test.local");
    expect(await checkSignup("ana@test.local")).toEqual({ ok: false, reason: "closed" });
  });

  it("solo con invitación, sirve el correo invitado sin importar mayúsculas ni espacios", async () => {
    await setMode("invite");
    await invite("ana@test.local");
    expect(await checkSignup("  Ana@Test.Local ")).toEqual({ ok: true });
    expect(await checkSignup("beto@test.local")).toEqual({ ok: false, reason: "not_invited" });
    expect(await checkSignup(undefined)).toEqual({ ok: false, reason: "not_invited" });
  });

  it("la base no acepta otro modo ni una segunda fila", async () => {
    await expect(db.insert(appSetting).values({ id: 1, signupMode: "otro" })).rejects.toThrow();
    await expect(db.insert(appSetting).values({ id: 2, signupMode: "open" })).rejects.toThrow();
  });

  it("marca la invitación como usada una sola vez", async () => {
    await invite("ana@test.local");
    const first = new Date("2026-10-22T15:00:00Z");
    await markInviteUsed("Ana@test.local", first);
    await markInviteUsed("ana@test.local", new Date("2026-10-23T15:00:00Z"));
    expect(await invites()).toEqual([{ email: "ana@test.local", usedAt: first }]);
    // Sin invitación no hace nada.
    await markInviteUsed("beto@test.local");
    expect(await invites()).toHaveLength(1);
  });
});

describe("el registro por HTTP", () => {
  const signUp = (email: string) => post("/sign-up/email", { name: "Ana", email, password: PASSWORD });

  it("abiertos: crea la cuenta como siempre", async () => {
    expect((await signUp("ana@test.local")).status).toBe(200);
    expect(await accounts()).toEqual([{ email: "ana@test.local" }]);
  });

  it("cerrados: lo rechaza con el correo de contacto y no crea la cuenta", async () => {
    await setMode("closed");
    const response = await signUp("ana@test.local");
    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ code: "SIGNUP_CLOSED", message: expect.stringContaining("los registros están cerrados") });
    expect(await accounts()).toEqual([]);
  });

  it("solo con invitación: rechaza al que no está invitado y deja entrar al invitado, que queda como usado", async () => {
    await setMode("invite");
    await invite("ana@test.local");

    const rejected = await signUp("beto@test.local");
    expect(rejected.status).toBe(403);
    expect(await json(rejected)).toMatchObject({ code: "SIGNUP_NOT_INVITED" });
    expect(await accounts()).toEqual([]);

    expect((await signUp("ANA@test.local")).status).toBe(200);
    expect(await accounts()).toEqual([{ email: "ana@test.local" }]);
    const [used] = await invites();
    expect(used.usedAt).toBeInstanceOf(Date);

    // La invitación usada no sirve para otra cuenta: el correo ya tiene una.
    expect((await signUp("ana@test.local")).status).not.toBe(200);
    expect(await db.select().from(user).where(eq(user.email, "ana@test.local"))).toHaveLength(1);
  });
});
