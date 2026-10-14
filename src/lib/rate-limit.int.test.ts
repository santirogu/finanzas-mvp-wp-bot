import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

// El límite de intentos de Better Auth se guarda en Postgres: así lo respetan todas las instancias
// de la app (en Vercel cada una tiene su propia memoria). Las pruebas pasan por el handler HTTP,
// que es donde Better Auth aplica el límite.

type Auth = (typeof import("./auth"))["auth"];

/** Una instancia nueva de la app: módulos recién cargados, sin nada compartido en memoria. */
async function freshInstance(): Promise<Auth> {
  vi.resetModules();
  return (await import("./auth")).auth;
}

function signIn(auth: Auth, ip: string, email = "nadie@test.local") {
  const origin = new URL(auth.options.baseURL!).origin;
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "clave-equivocada-123" }),
    }),
  );
}

describe("límite de intentos de login", () => {
  it("bloquea el cuarto intento en 10 segundos desde la misma IP, con el tiempo de espera", async () => {
    const auth = await freshInstance();
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await signIn(auth, "203.0.113.10")).status);
    const blocked = await signIn(auth, "203.0.113.10");

    expect(statuses).toEqual([401, 401, 401]);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
  });

  it("se guarda en la base y lo respetan las demás instancias de la app", async () => {
    const first = await freshInstance();
    for (let i = 0; i < 3; i++) await signIn(first, "203.0.113.20");

    const [row] = await db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, "203.0.113.20|/sign-in/email"));
    expect(row).toMatchObject({ count: 3 });

    const second = await freshInstance();
    expect(second).not.toBe(first);
    expect((await signIn(second, "203.0.113.20")).status).toBe(429);
  });

  it("cada IP tiene su propio contador", async () => {
    const auth = await freshInstance();
    for (let i = 0; i < 4; i++) await signIn(auth, "203.0.113.30");

    expect((await signIn(auth, "203.0.113.31")).status).toBe(401);
  });
});
