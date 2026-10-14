import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { loginFailure } from "@/db/schema";
import { auth } from "@/lib/auth";
import { LOCKOUT, clearFailures, lockedUntil, normalizeEmail, recordFailure } from "./lockout";

const T0 = new Date("2026-10-14T15:00:00Z");
const after = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("lockout (módulo)", () => {
  it("normaliza el correo y descarta lo que no es texto", () => {
    expect(normalizeEmail("  Ana@Test.Local ")).toBe("ana@test.local");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });

  it("bloquea la cuenta al quinto fallo dentro de la ventana, por 15 minutos", async () => {
    for (let i = 1; i < LOCKOUT.maxFailures; i++) {
      expect(await recordFailure("ana@test.local", after(i))).toEqual({ failures: i, lockedUntil: null });
    }
    expect(await lockedUntil("ana@test.local", after(4))).toBeNull();

    const fifth = await recordFailure("ana@test.local", after(5));
    expect(fifth).toEqual({ failures: 5, lockedUntil: after(20) });
    expect(await lockedUntil("ana@test.local", after(19))).toEqual(after(20));
    expect(await lockedUntil("ana@test.local", after(20))).toBeNull();
  });

  it("si el primer fallo salió de la ventana, vuelve a contar desde uno", async () => {
    for (let i = 0; i < 4; i++) await recordFailure("beto@test.local", after(i));
    expect(await recordFailure("beto@test.local", after(16))).toEqual({ failures: 1, lockedUntil: null });
  });

  it("un login correcto borra el contador", async () => {
    await recordFailure("caro@test.local", T0);
    await clearFailures("caro@test.local");
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "caro@test.local"))).toEqual([]);
  });

  it("borra los registros de más de un día", async () => {
    await recordFailure("viejo@test.local", T0);
    await recordFailure("nuevo@test.local", after(24 * 60 + 1));
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
