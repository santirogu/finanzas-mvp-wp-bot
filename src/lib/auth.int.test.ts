import { isAPIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import { CONSENT } from "../../test/integration/auth-http";
import { auth } from "./auth";
import { PRIVACY_VERSION } from "./privacy";

// El formulario de registro lo envía el navegador: nadie debe poder elegir al registrarse campos
// que controla el servidor (zona horaria, correo verificado).
describe("registro (Better Auth)", () => {
  it("ignora la zona horaria y la verificación del correo que mande el cliente", async () => {
    await auth.api.signUpEmail({
      body: {
        name: "Ana",
        email: "ana@test.local",
        password: "clave-segura-123",
        timezone: "Asia/Tokyo",
        emailVerified: true,
        ...CONSENT,
      } as never,
    });

    const [row] = await db.select().from(user).where(eq(user.email, "ana@test.local"));
    expect(row).toMatchObject({
      name: "Ana",
      timezone: "America/Bogota",
      emailVerified: false,
    });
  });

  it("no permite iniciar sesión con la contraseña equivocada", async () => {
    await auth.api.signUpEmail({
      body: { name: "Beto", email: "beto@test.local", password: "clave-segura-123", ...CONSENT },
    });

    await expect(
      auth.api.signInEmail({ body: { email: "beto@test.local", password: "otra-clave-123" } }),
    ).rejects.toThrow();
  });
});

// La autorización para tratar los datos (Ley 1581, src/lib/privacy.ts): la casilla del registro, expresa y con la
// versión de la política, y guardada de forma que se pueda probar.
describe("registro: la autorización de los datos", () => {
  const signUp = (extra: Record<string, unknown>) =>
    auth.api.signUpEmail({ body: { name: "Ana", email: "ana@test.local", password: "clave-segura-123", ...extra } as never });
  const codeOf = async (attempt: Promise<unknown>) => {
    const error = await attempt.then(() => null, (e: unknown) => e);
    return isAPIError(error) ? (error.body as { code?: unknown } | undefined)?.code : error;
  };
  const accounts = () => db.select().from(user);

  it("sin la casilla no se crea la cuenta", async () => {
    expect(await codeOf(signUp({}))).toBe("PRIVACY_CONSENT_REQUIRED");
    expect(await accounts()).toEqual([]);
  });

  it("ni con la de otra versión de la política (una página abierta desde antes de cambiarla)", async () => {
    expect(await codeOf(signUp({ privacyConsent: "2020-01-01" }))).toBe("PRIVACY_CONSENT_REQUIRED");
    expect(await codeOf(signUp({ privacyConsent: true }))).toBe("PRIVACY_CONSENT_REQUIRED");
    expect(await accounts()).toEqual([]);
  });

  it("con la casilla, la cuenta guarda la versión y cuándo, y el historial lo registra", async () => {
    const before = Date.now();
    await signUp(CONSENT);
    const [row] = await accounts();
    expect(row.privacyVersion).toBe(PRIVACY_VERSION);
    expect(row.privacyAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.privacyAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const events = await db
      .select({ type: accountEvent.type, details: accountEvent.details })
      .from(accountEvent)
      .where(eq(accountEvent.userId, row.id))
      // Por el orden del tipo en la base (src/db/schema/events.ts).
      .orderBy(asc(accountEvent.type));
    expect(events).toEqual([
      { type: "registered", details: {} },
      { type: "privacy_accepted", details: { privacyVersion: PRIVACY_VERSION } },
    ]);
  });

  it("el navegador no puede escribir la autorización a mano (ni otra versión ni otra fecha)", async () => {
    expect(await codeOf(signUp({ ...CONSENT, privacyVersion: "otra" }))).toBe("FIELD_NOT_ALLOWED");
    expect(await codeOf(signUp({ ...CONSENT, privacyAcceptedAt: "2020-01-01T00:00:00Z" }))).toBe("FIELD_NOT_ALLOWED");
    expect(await accounts()).toEqual([]);
  });
});
