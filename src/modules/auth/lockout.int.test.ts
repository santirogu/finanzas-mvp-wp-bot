import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { loginFailure } from "@/db/schema";
import { auth } from "@/lib/auth";
import { LOCKOUT, clearFailures, lockedUntil, normalizeEmail, releaseAttempt, reserveAttempt } from "./lockout";

const T0 = new Date("2026-10-14T15:00:00Z");
const after = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const row = async (email: string) =>
  (await db.select({ failures: loginFailure.failures, lockedUntil: loginFailure.lockedUntil }).from(loginFailure).where(eq(loginFailure.email, email)))[0] ??
  null;

describe("lockout (módulo)", () => {
  it("normaliza el correo y descarta lo que no es texto", () => {
    expect(normalizeEmail("  Ana@Test.Local ")).toBe("ana@test.local");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });

  it("cada intento reservado cuenta; al quinto la cuenta queda bloqueada 15 minutos", async () => {
    for (let i = 1; i < LOCKOUT.maxFailures; i++) {
      expect(await reserveAttempt("ana@test.local", after(i))).toEqual({ ok: true });
      expect(await row("ana@test.local")).toEqual({ failures: i, lockedUntil: null });
    }
    expect(await lockedUntil("ana@test.local", after(4))).toBeNull();

    expect(await reserveAttempt("ana@test.local", after(5))).toEqual({ ok: true });
    expect(await row("ana@test.local")).toEqual({ failures: 5, lockedUntil: after(20) });
    // El sexto ya no se reserva (ni se verifica): dice hasta cuándo está bloqueada.
    expect(await reserveAttempt("ana@test.local", after(6))).toEqual({ ok: false, lockedUntil: after(20) });
    expect(await row("ana@test.local")).toEqual({ failures: 5, lockedUntil: after(20) });
    expect(await lockedUntil("ana@test.local", after(19))).toEqual(after(20));
    expect(await lockedUntil("ana@test.local", after(20))).toBeNull();
  });

  it("devolver un intento no lo cuenta como fallo y levanta el bloqueo que había puesto", async () => {
    for (let i = 0; i < LOCKOUT.maxFailures; i++) await reserveAttempt("ana@test.local", after(i));
    expect((await row("ana@test.local"))?.lockedUntil).toEqual(after(19));

    await releaseAttempt("ana@test.local");
    expect(await row("ana@test.local")).toEqual({ failures: 4, lockedUntil: null });
    expect(await reserveAttempt("ana@test.local", after(5))).toEqual({ ok: true });
  });

  it("devolver el único intento borra el registro; sin registro no hace nada", async () => {
    await reserveAttempt("ana@test.local", T0);
    await releaseAttempt("ana@test.local");
    expect(await row("ana@test.local")).toBeNull();
    await releaseAttempt("nadie@test.local");
    expect(await db.select().from(loginFailure)).toEqual([]);
  });

  it("si el primer intento salió de la ventana, vuelve a contar desde uno", async () => {
    for (let i = 0; i < 4; i++) await reserveAttempt("beto@test.local", after(i));
    expect(await reserveAttempt("beto@test.local", after(16))).toEqual({ ok: true });
    expect(await row("beto@test.local")).toEqual({ failures: 1, lockedUntil: null });
  });

  it("cuando vence el bloqueo, vuelve a contar desde uno", async () => {
    for (let i = 0; i < LOCKOUT.maxFailures; i++) await reserveAttempt("beto@test.local", after(i));
    expect(await reserveAttempt("beto@test.local", after(18))).toMatchObject({ ok: false });
    expect(await reserveAttempt("beto@test.local", after(19))).toEqual({ ok: true });
    expect(await row("beto@test.local")).toEqual({ failures: 1, lockedUntil: null });
  });

  it("intentos simultáneos: como mucho 5 se reservan", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveAttempt("caro@test.local", T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(LOCKOUT.maxFailures);
    expect(await row("caro@test.local")).toEqual({ failures: 5, lockedUntil: after(15) });
  });

  it("con los intentos usados pero sin fecha de bloqueo (no debería pasar), igual bloquea 15 minutos", async () => {
    await db.insert(loginFailure).values({ email: "dan@test.local", failures: 5, firstFailureAt: T0, lockedUntil: null });
    expect(await reserveAttempt("dan@test.local", after(1))).toEqual({ ok: false, lockedUntil: after(16) });
  });

  it("un login correcto borra el contador", async () => {
    await reserveAttempt("caro@test.local", T0);
    await clearFailures("caro@test.local");
    expect(await row("caro@test.local")).toBeNull();
  });

  it("borra los registros de más de un día", async () => {
    await reserveAttempt("viejo@test.local", T0);
    await reserveAttempt("nuevo@test.local", after(24 * 60 + 1));
    const emails = (await db.select().from(loginFailure)).map((r) => r.email);
    expect(emails).toEqual(["nuevo@test.local"]);
  });
});

// Flujo completo por el handler HTTP. Cada intento sale de otra IP: el bloqueo es por cuenta, no
// por IP (el límite por IP, 3 cada 10 s, se prueba en src/lib/rate-limit.int.test.ts).
let ipSeq = 1;
function signIn(email: string, password: string) {
  const origin = new URL(auth.options.baseURL!).origin;
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-forwarded-for": `198.51.100.${ipSeq++ % 250}`,
      },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function createAccount(email: string, password = "clave-correcta-123") {
  await auth.api.signUpEmail({ body: { name: "Prueba", email, password } });
}

describe("bloqueo por cuenta (Better Auth)", () => {
  it("tras 5 contraseñas equivocadas desde IPs distintas, ni la correcta entra", async () => {
    await createAccount("ana@test.local");
    for (let i = 0; i < 5; i++) {
      expect((await signIn("ana@test.local", `equivocada-${i}-123`)).status).toBe(401);
    }

    const blocked = await signIn("ana@test.local", "clave-correcta-123");
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.code).toBe("ACCOUNT_LOCKED");
    expect(body.message).toMatch(/bloqueada por varios intentos fallidos\. Intenta de nuevo en 15 minutos\./);
  });

  it("20 intentos simultáneos desde IPs distintas: solo 5 contraseñas se verifican", async () => {
    await createAccount("ana@test.local");
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => signIn("ana@test.local", `mala-${i}`)));
    const codes = await Promise.all(responses.map(async (response) => (await response.json()).code));
    expect(codes.filter((code) => code === "INVALID_EMAIL_OR_PASSWORD")).toHaveLength(LOCKOUT.maxFailures);
    expect(codes.filter((code) => code === "ACCOUNT_LOCKED")).toHaveLength(15);
    // Y la correcta ya no entra.
    expect((await signIn("ana@test.local", "clave-correcta-123")).status).toBe(429);
  });

  it("no afecta a otras cuentas", async () => {
    await createAccount("ana@test.local");
    await createAccount("beto@test.local");
    for (let i = 0; i < 5; i++) await signIn("ana@test.local", `equivocada-${i}-123`);

    expect((await signIn("beto@test.local", "clave-correcta-123")).status).toBe(200);
  });

  it("no distingue mayúsculas en el correo", async () => {
    await createAccount("caro@test.local");
    for (let i = 0; i < 5; i++) await signIn(i % 2 ? "CARO@TEST.LOCAL" : "Caro@Test.Local", "equivocada-123");

    expect((await signIn("caro@test.local", "clave-correcta-123")).status).toBe(429);
  });

  it("un correo que no existe también se bloquea (no revela cuáles están registrados)", async () => {
    for (let i = 0; i < 5; i++) await signIn("nadie@test.local", "lo-que-sea-123");
    const response = await signIn("nadie@test.local", "lo-que-sea-123");
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("ACCOUNT_LOCKED");
  });

  it("un login correcto antes del quinto fallo reinicia la cuenta", async () => {
    await createAccount("dani@test.local");
    for (let i = 0; i < 4; i++) await signIn("dani@test.local", "equivocada-123");
    expect((await signIn("dani@test.local", "clave-correcta-123")).status).toBe(200);

    for (let i = 0; i < 4; i++) await signIn("dani@test.local", "equivocada-123");
    expect((await signIn("dani@test.local", "clave-correcta-123")).status).toBe(200);
  });

  it("cuando vence el bloqueo, la contraseña correcta vuelve a funcionar", async () => {
    await createAccount("eva@test.local");
    for (let i = 0; i < 5; i++) await signIn("eva@test.local", "equivocada-123");
    await db
      .update(loginFailure)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(loginFailure.email, "eva@test.local"));

    expect((await signIn("eva@test.local", "clave-correcta-123")).status).toBe(200);
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "eva@test.local"))).toEqual([]);
  });

  it("los errores que no son de contraseña no cuentan como fallos", async () => {
    for (let i = 0; i < 6; i++) await signIn("no-es-un-correo", "x");
    expect(await db.select().from(loginFailure)).toEqual([]);
  });
});
