import { asc } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, appSetting, signupInvite } from "@/db/schema";
import { createUser } from "../../../../../../test/integration/factories";
import { requestLocale } from "../../../../../../test/integration/locale";
import { createAdminWithTwoFactor } from "../../../../../../test/integration/two-factor";

// Los registros desde /admin/configuracion: las Server Actions con la capa de datos y la base de verdad, y los
// códigos como Google Authenticator. Se simulan la sesión y refresh().
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { addSignupInviteAction, changeSignupModeAction, removeSignupInviteAction } = await import("./actions");
const { getSignupSettings, signupSummary } = await import("@/modules/admin/configuracion/signup");
const { getSignupMode } = await import("@/modules/auth/signup-policy");

// Cada código sirve una vez y nunca uno anterior: cada acción usa el de los siguientes 30 s.
let step = 0;
async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  mocks.refresh.mockReset();
  step = 0;
  return { admin, code: () => codeAt(new Date(Date.now() + 30_000 * step++)) };
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const events = () =>
  db
    .select({ type: accountEvent.type, userId: accountEvent.userId, adminId: accountEvent.adminId, details: accountEvent.details })
    .from(accountEvent)
    .orderBy(asc(accountEvent.createdAt));

describe("quién puede crear una cuenta", () => {
  it("sin cambios: abiertos, sin invitados y sin último cambio", async () => {
    await seed();
    expect(await getSignupSettings()).toEqual({ mode: "open", invites: [], updated: null });
    expect(await signupSummary()).toEqual({ mode: "open", pending: 0 });
  });

  it("con el código los cierra, queda en el historial (sin cuenta) con el de antes, y luego solo con invitación", async () => {
    const { admin, code } = await seed();
    expect(await changeSignupModeAction({}, form({ mode: "closed", code: code() }))).toEqual({
      message: "Los registros quedaron cerrados: nadie puede crear una cuenta nueva.",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(await getSignupMode()).toBe("closed");
    const view = await getSignupSettings();
    expect(view).toMatchObject({ mode: "closed", updated: { by: "Ana Admin" } });
    expect(view.updated!.at).toBeInstanceOf(Date);

    expect(await changeSignupModeAction({}, form({ mode: "invite", code: code() }))).toEqual({
      message: "Ahora solo se puede crear una cuenta con invitación.",
    });
    expect(await events()).toEqual([
      { type: "signup_mode_changed", userId: null, adminId: admin.id, details: { signupMode: "closed", previousSignupMode: "open" } },
      { type: "signup_mode_changed", userId: null, adminId: admin.id, details: { signupMode: "invite", previousSignupMode: "closed" } },
    ]);
    expect(await db.select({ id: appSetting.id }).from(appSetting)).toEqual([{ id: 1 }]);
  });

  it("los vuelve a abrir", async () => {
    const { code } = await seed();
    await db.insert(appSetting).values({ id: 1, signupMode: "invite" });
    expect(await changeSignupModeAction({}, form({ mode: "open", code: code() }))).toEqual({
      message: "Los registros quedaron abiertos: cualquiera puede crear una cuenta.",
    });
    expect(await getSignupMode()).toBe("open");
    expect(await events()).toMatchObject([{ type: "signup_mode_changed", details: { signupMode: "open", previousSignupMode: "invite" } }]);
  });

  it("con un código equivocado no cambia nada", async () => {
    await seed();
    expect(await changeSignupModeAction({}, form({ mode: "closed", code: "000000" }))).toMatchObject({ field: "code" });
    expect(await getSignupMode()).toBe("open");
    expect(await events()).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("un modo que no existe o el mismo de ahora, lo dice sin gastar el código", async () => {
    const { code } = await seed();
    const unused = code();
    expect(await changeSignupModeAction({}, form({ mode: "todos", code: unused }))).toEqual({ error: "Elige una de las opciones.", field: "mode" });
    expect(await changeSignupModeAction({}, form({ code: unused }))).toEqual({ error: "Elige una de las opciones.", field: "mode" });
    expect(await changeSignupModeAction({}, form({ mode: "open", code: unused }))).toEqual({
      error: "Los registros ya están así: elige otra opción.",
      field: "mode",
    });
    // El mismo código sigue sirviendo para lo que sí cambia.
    expect(await changeSignupModeAction({}, form({ mode: "invite", code: unused }))).toHaveProperty("message");
    expect(await events()).toHaveLength(1);
  });

  it("en inglés", async () => {
    const { code } = await seed();
    requestLocale.value = "en";
    expect(await changeSignupModeAction({}, form({ mode: "closed", code: code() }))).toEqual({
      message: "Sign-ups are closed: nobody can create a new account.",
    });
    expect(await addSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ message: "beto@test.local was invited" });
    expect(await addSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ error: "That email is already invited.", field: "email" });
    expect(await removeSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ message: "The invitation for beto@test.local was removed" });
    expect(await removeSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ error: "That invitation no longer exists." });
  });
});

describe("los invitados", () => {
  it("invita un correo (sin mayúsculas ni espacios), sin código, y queda en el historial", async () => {
    const { admin } = await seed();
    expect(await addSignupInviteAction({}, form({ email: "  Beto@Test.Local " }))).toEqual({ message: "Se invitó a beto@test.local" });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const { invites } = await getSignupSettings();
    expect(invites).toEqual([{ email: "beto@test.local", invitedAt: expect.any(Date), usedAt: null }]);
    expect(await events()).toEqual([{ type: "signup_invite_added", userId: null, adminId: admin.id, details: { email: "beto@test.local" } }]);
  });

  it("no invita un correo inválido, uno ya invitado ni uno que ya tiene cuenta", async () => {
    await seed();
    await createUser({ email: "Carla@test.local" });
    expect(await addSignupInviteAction({}, form({ email: "no-es-correo" }))).toEqual({ error: "Escribe un correo válido.", field: "email" });
    expect(await addSignupInviteAction({}, form({ email: `${"a".repeat(250)}@test.local` }))).toEqual({ error: "Escribe un correo válido.", field: "email" });
    expect(await addSignupInviteAction({}, form({}))).toEqual({ error: "Escribe un correo válido.", field: "email" });
    expect(await addSignupInviteAction({}, form({ email: "carla@test.local" }))).toEqual({ error: "Ese correo ya tiene una cuenta.", field: "email" });
    await addSignupInviteAction({}, form({ email: "beto@test.local" }));
    expect(await addSignupInviteAction({}, form({ email: "BETO@test.local" }))).toEqual({ error: "Ese correo ya está invitado.", field: "email" });
    expect(await db.select({ email: signupInvite.email }).from(signupInvite)).toEqual([{ email: "beto@test.local" }]);
    expect((await events()).map((e) => e.type)).toEqual(["signup_invite_added"]);
  });

  it("quita una invitación y queda en el historial; una que ya no existe, lo dice", async () => {
    const { admin } = await seed();
    await addSignupInviteAction({}, form({ email: "beto@test.local" }));
    expect(await removeSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ message: "Se quitó la invitación de beto@test.local" });
    expect(await removeSignupInviteAction({}, form({ email: "beto@test.local" }))).toEqual({ error: "Esa invitación ya no existe." });
    expect(await db.select().from(signupInvite)).toEqual([]);
    expect(await events()).toEqual([
      { type: "signup_invite_added", userId: null, adminId: admin.id, details: { email: "beto@test.local" } },
      { type: "signup_invite_removed", userId: null, adminId: admin.id, details: { email: "beto@test.local" } },
    ]);
  });

  it("los pendientes primero (los más nuevos arriba) y luego los usados; Inicio cuenta los pendientes", async () => {
    await seed();
    await db.insert(signupInvite).values([
      { email: "vieja@test.local", createdAt: new Date("2026-10-01T15:00:00Z") },
      { email: "usada@test.local", createdAt: new Date("2026-10-20T15:00:00Z"), usedAt: new Date("2026-10-21T15:00:00Z") },
      { email: "nueva@test.local", createdAt: new Date("2026-10-10T15:00:00Z") },
    ]);
    expect((await getSignupSettings()).invites.map((i) => i.email)).toEqual(["nueva@test.local", "vieja@test.local", "usada@test.local"]);
    expect(await signupSummary()).toEqual({ mode: "open", pending: 2 });
  });
});

describe("sin rol de admin", () => {
  it("cada acción y consulta se detiene en requireAdmin", async () => {
    mocks.requireAdmin.mockReset().mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(changeSignupModeAction({}, form({ mode: "closed", code: "123456" }))).rejects.toThrow();
    await expect(addSignupInviteAction({}, form({ email: "beto@test.local" }))).rejects.toThrow();
    await expect(removeSignupInviteAction({}, form({ email: "beto@test.local" }))).rejects.toThrow();
    await expect(getSignupSettings()).rejects.toThrow();
    await expect(signupSummary()).rejects.toThrow();
    expect(await getSignupMode()).toBe("open");
    expect(await db.select().from(signupInvite)).toEqual([]);
  });
});
