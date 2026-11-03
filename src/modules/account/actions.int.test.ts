import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, loginFailure, transaction, user } from "@/db/schema";
import { ACCOUNT_LOCKED } from "@/lib/auth-errors";
import { PRIVACY_VERSION } from "@/lib/privacy";
import type { CurrentUser } from "@/lib/session";
import { LOCKOUT } from "@/modules/auth/lockout";
import { createUser } from "../../../test/integration/factories";
import { requestLocale } from "../../../test/integration/locale";

// La sesión, las cabeceras, el redirect y la verificación de contraseña de Better Auth se
// simulan (la verificación real la prueba la E2E); el borrado corre contra la base de pruebas.
const mocks = vi.hoisted(() => ({
  session: null as CurrentUser | null,
  verifyPassword: vi.fn(),
  signOut: vi.fn(),
}));
// requireSignedIn: la sesión sin exigir la autorización de los datos (eliminar la cuenta y darla).
const sessionOrLogin = async () => {
  if (!mocks.session) throw new Error("NEXT_REDIRECT /login");
  return mocks.session;
};
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(sessionOrLogin), requireSignedIn: vi.fn(sessionOrLogin) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "sesion=1" }) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { verifyPassword: mocks.verifyPassword, signOut: mocks.signOut } },
}));

const { acceptPrivacyAction, deleteAccountAction } = await import("./actions");

async function signIn(email = "ana@test.local", privacyVersion: string | null = PRIVACY_VERSION) {
  const row = await createUser({ email, privacyVersion, privacyAcceptedAt: privacyVersion ? new Date() : null });
  mocks.session = { id: row.id, name: row.name, email: row.email, timezone: row.timezone, role: row.role, superAdmin: row.superAdmin, twoFactorEnabled: row.twoFactorEnabled, privacyVersion: row.privacyVersion };
  await db.insert(transaction).values({
    userId: row.id,
    type: "expense",
    amount: 1000,
    description: "Algo",
    occurredOn: "2026-10-10",
  });
  return row;
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const userExists = async (id: string) => (await db.select().from(user).where(eq(user.id, id))).length === 1;

beforeEach(() => {
  mocks.session = null;
  mocks.verifyPassword.mockReset().mockResolvedValue({ status: true });
  mocks.signOut.mockReset().mockResolvedValue({ success: true });
});

describe("deleteAccountAction", () => {
  it("exige sesión", async () => {
    await expect(
      deleteAccountAction({}, form({ password: "x", confirmation: "ELIMINAR" })),
    ).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("con la contraseña correcta cierra la sesión, borra todo y lleva a la confirmación", async () => {
    const ana = await signIn();

    await expect(
      deleteAccountAction({}, form({ password: "clave-segura-123", confirmation: "ELIMINAR" })),
    ).rejects.toThrow("NEXT_REDIRECT /cuenta-eliminada");

    expect(mocks.verifyPassword).toHaveBeenCalledWith({
      body: { password: "clave-segura-123" },
      headers: expect.any(Headers),
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(await userExists(ana.id)).toBe(false);
    expect(await db.select().from(transaction).where(eq(transaction.userId, ana.id))).toEqual([]);
  });

  it("acepta la palabra de confirmación sin importar mayúsculas ni espacios", async () => {
    const ana = await signIn();
    await expect(
      deleteAccountAction({}, form({ password: "clave", confirmation: "  eliminar " })),
    ).rejects.toThrow("NEXT_REDIRECT /cuenta-eliminada");
    expect(await userExists(ana.id)).toBe(false);
  });

  it("sin contraseña o sin la palabra de confirmación no verifica ni borra nada", async () => {
    const ana = await signIn();

    expect(await deleteAccountAction({}, form({ password: "", confirmation: "borrar" }))).toEqual({
      fieldErrors: {
        password: "Escribe tu contraseña.",
        confirmation: "Escribe ELIMINAR para confirmar.",
      },
    });
    expect(await deleteAccountAction({}, form({ password: "clave", confirmation: "" }))).toEqual({
      fieldErrors: { confirmation: "Escribe ELIMINAR para confirmar." },
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(await userExists(ana.id)).toBe(true);
  });

  it("con la contraseña equivocada no borra nada y suma un intento fallido", async () => {
    const ana = await signIn();
    mocks.verifyPassword.mockRejectedValue(
      APIError.from("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" }),
    );

    expect(await deleteAccountAction({}, form({ password: "otra", confirmation: "ELIMINAR" }))).toEqual({
      fieldErrors: { password: "Contraseña incorrecta." },
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(await userExists(ana.id)).toBe(true);
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "ana@test.local"))).toEqual([
      expect.objectContaining({ failures: 1 }),
    ]);
  });

  it("con la cuenta bloqueada por intentos fallidos ni siquiera verifica la contraseña", async () => {
    const ana = await signIn();
    await db.insert(loginFailure).values({
      email: "ana@test.local",
      failures: LOCKOUT.maxFailures,
      firstFailureAt: new Date(),
      lockedUntil: new Date(Date.now() + 60_000),
    });

    expect(await deleteAccountAction({}, form({ password: "clave", confirmation: "ELIMINAR" }))).toEqual({
      error: ACCOUNT_LOCKED,
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(await userExists(ana.id)).toBe(true);
  });

  it("si Better Auth no puede verificar la contraseña por otra razón, lo dice y no cuenta un fallo", async () => {
    const ana = await signIn();
    mocks.verifyPassword.mockRejectedValue(APIError.from("UNAUTHORIZED", { code: "SESSION_EXPIRED", message: "x" }));

    expect(await deleteAccountAction({}, form({ password: "clave", confirmation: "ELIMINAR" }))).toEqual({
      error: "No pudimos verificar tu contraseña. Cierra sesión y vuelve a entrar.",
    });
    expect(await userExists(ana.id)).toBe(true);
    expect(await db.select().from(loginFailure)).toEqual([]);
  });

  it("un error inesperado no se esconde ni borra nada", async () => {
    const ana = await signIn();
    mocks.verifyPassword.mockRejectedValue(new Error("se cayó la base"));

    await expect(
      deleteAccountAction({}, form({ password: "clave", confirmation: "ELIMINAR" })),
    ).rejects.toThrow("se cayó la base");
    expect(await userExists(ana.id)).toBe(true);
  });

  it("solo borra la cuenta de quien tiene la sesión", async () => {
    const beto = await createUser({ email: "beto@test.local" });
    const ana = await signIn();

    await expect(
      deleteAccountAction({}, form({ password: "clave", confirmation: "ELIMINAR", userId: beto.id })),
    ).rejects.toThrow("NEXT_REDIRECT /cuenta-eliminada");

    expect(await userExists(ana.id)).toBe(false);
    expect(await userExists(beto.id)).toBe(true);
  });
});

describe("deleteAccountAction · sin la autorización de los datos", () => {
  it("también se puede eliminar la cuenta: quien no la da puede irse con todo borrado", async () => {
    const ana = await signIn("ana@test.local", null);
    await expect(deleteAccountAction({}, form({ password: "clave", confirmation: "ELIMINAR" }))).rejects.toThrow("NEXT_REDIRECT /cuenta-eliminada");
    expect(await userExists(ana.id)).toBe(false);
  });
});

describe("acceptPrivacyAction (la autorización de una cuenta que no la tenía)", () => {
  const consentOf = async (id: string) => {
    const [row] = await db.select({ version: user.privacyVersion, at: user.privacyAcceptedAt }).from(user).where(eq(user.id, id));
    return row;
  };
  const consentEvents = (id: string) =>
    db
      .select({ details: accountEvent.details })
      .from(accountEvent)
      .where(and(eq(accountEvent.userId, id), eq(accountEvent.type, "privacy_accepted")));

  it("exige sesión", async () => {
    await expect(acceptPrivacyAction({}, form({ privacy: "on" }))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("sin la casilla marcada no guarda nada (es expresa)", async () => {
    const ana = await signIn("ana@test.local", null);
    for (const value of [{}, { privacy: "" }, { privacy: "off" }, { privacy: "true" }] as Record<string, string>[]) {
      expect(await acceptPrivacyAction({}, form(value))).toEqual({ error: "Para seguir, marca la casilla de la autorización." });
    }
    expect(await consentOf(ana.id)).toEqual({ version: null, at: null });
    expect(await consentEvents(ana.id)).toEqual([]);
    requestLocale.value = "en";
    expect(await acceptPrivacyAction({}, form({}))).toEqual({ error: "To continue, check the authorization box." });
  });

  it("con la casilla guarda la versión vigente, cuándo y el evento (la prueba), y lleva al Resumen", async () => {
    const ana = await signIn("ana@test.local", null);
    const before = Date.now();
    await expect(acceptPrivacyAction({}, form({ privacy: "on" }))).rejects.toThrow("NEXT_REDIRECT /dashboard");
    const saved = await consentOf(ana.id);
    expect(saved.version).toBe(PRIVACY_VERSION);
    expect(saved.at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await consentEvents(ana.id)).toEqual([{ details: { privacyVersion: PRIVACY_VERSION } }]);
  });

  it("una cuenta con una versión anterior autoriza la vigente", async () => {
    const ana = await signIn("ana@test.local", "2020-01-01");
    await expect(acceptPrivacyAction({}, form({ privacy: "on" }))).rejects.toThrow("NEXT_REDIRECT /dashboard");
    expect((await consentOf(ana.id)).version).toBe(PRIVACY_VERSION);
  });

  it("dos envíos seguidos dejan un solo evento y la primera fecha", async () => {
    const ana = await signIn("ana@test.local", null);
    await expect(acceptPrivacyAction({}, form({ privacy: "on" }))).rejects.toThrow("NEXT_REDIRECT /dashboard");
    const first = await consentOf(ana.id);
    await expect(acceptPrivacyAction({}, form({ privacy: "on" }))).rejects.toThrow("NEXT_REDIRECT /dashboard");
    expect(await consentOf(ana.id)).toEqual(first);
    expect(await consentEvents(ana.id)).toHaveLength(1);
  });

  it("solo la cuenta de quien tiene la sesión", async () => {
    const beto = await createUser({ email: "beto@test.local", privacyVersion: null, privacyAcceptedAt: null });
    await signIn("ana@test.local", null);
    await expect(acceptPrivacyAction({}, form({ privacy: "on", userId: beto.id }))).rejects.toThrow("NEXT_REDIRECT /dashboard");
    expect(await consentOf(beto.id)).toEqual({ version: null, at: null });
    expect(await consentEvents(beto.id)).toEqual([]);
  });
});

describe("deleteAccountAction · en inglés", () => {
  it("pide la palabra en inglés (DELETE): con ELIMINAR no borra, y los mensajes van en inglés", async () => {
    const ana = await signIn();
    requestLocale.value = "en";

    expect(await deleteAccountAction({}, form({ password: "", confirmation: "ELIMINAR" }))).toEqual({
      fieldErrors: { password: "Enter your password.", confirmation: "Type DELETE to confirm." },
    });
    mocks.verifyPassword.mockRejectedValueOnce(new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" }));
    expect(await deleteAccountAction({}, form({ password: "mala", confirmation: "delete" }))).toEqual({
      fieldErrors: { password: "Wrong password." },
    });
    expect(await userExists(ana.id)).toBe(true);

    await expect(deleteAccountAction({}, form({ password: "clave", confirmation: " Delete " }))).rejects.toThrow("NEXT_REDIRECT /cuenta-eliminada");
    expect(await userExists(ana.id)).toBe(false);
  });
});
