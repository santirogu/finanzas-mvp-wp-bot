import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import { db } from "@/db";
import { loginFailure, twoFactor, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { AUTH_DISABLED_PATHS, AUTH_HTTP_ROUTES } from "@/modules/auth/http-routes";
import { adminWithTwoFactor, Jar, json, nextIp, PASSWORD, post, register, signIn } from "../../test/integration/auth-http";
import { totp } from "../../test/totp";

// Las rutas de Better Auth que la app atiende (src/modules/auth/http-routes.ts) y lo que se cerró en
// la auditoría de seguridad del 2026-10-15.

const ORIGIN = new URL(auth.options.baseURL!).origin;
const ALLOWED_PATHS = Object.keys(AUTH_HTTP_ROUTES).map((route) => route.split(" ")[1]);
const endpointPaths = Object.values(auth.api)
  .map((endpoint) => (endpoint as { path?: string }).path)
  .filter((path): path is string => Boolean(path));

/** Un pedido al route handler de Next (/api/auth/[...all]), como lo recibe en producción. */
function routeRequest(method: "GET" | "POST", path: string, { body, jar }: { body?: unknown; jar?: Jar } = {}) {
  const request = new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      "x-forwarded-for": nextIp(),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(jar ? { cookie: jar.header() } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (method === "GET" ? GET : POST)(request).then((response) => {
    jar?.update(response);
    return response;
  });
}

describe("cada endpoint de Better Auth está clasificado", () => {
  it("o la app lo usa, o está apagado, o tiene parámetros (lo corta el route handler)", () => {
    const unclassified = endpointPaths.filter(
      (path) => !ALLOWED_PATHS.includes(path) && !(AUTH_DISABLED_PATHS as readonly string[]).includes(path) && !path.includes(":"),
    );
    // Si falla tras actualizar Better Auth: agrega la ruta nueva a AUTH_DISABLED_PATHS (o, si la app
    // la usa desde el navegador, a AUTH_HTTP_ROUTES).
    expect(unclassified).toEqual([]);
  });

  it("la lista de apagadas no tiene rutas que ya no existen", () => {
    for (const path of AUTH_DISABLED_PATHS) expect(endpointPaths, path).toContain(path);
  });
});

describe("rutas apagadas", () => {
  it.each([...AUTH_DISABLED_PATHS])("%s responde 404 dentro de Better Auth y en el route handler", async (path) => {
    const jar = await register("ana@test.local");
    expect((await post(path, { password: PASSWORD }, jar)).status).toBe(404);
    expect((await routeRequest("POST", path, { body: { password: PASSWORD }, jar })).status).toBe(404);
    expect((await routeRequest("GET", path, { jar })).status).toBe(404);
  });

  it.each(["/callback/google", "/reset-password/abc", "/admin/set-role", "/no-existe", "/sign-in/email/", "/SIGN-IN/email"])(
    "el route handler corta lo que no está en la lista: %s",
    async (path) => {
      expect((await routeRequest("POST", path, { body: {} })).status).toBe(404);
      expect((await routeRequest("GET", path)).status).toBe(404);
    },
  );

  it("una ruta permitida con otro método también responde 404", async () => {
    expect((await routeRequest("GET", "/sign-in/email")).status).toBe(404);
  });
});

describe("las rutas que usa la app siguen funcionando por el route handler", () => {
  it("registrarse, salir (desde el servidor) y entrar", async () => {
    const jar = new Jar();
    const signUp = await routeRequest("POST", "/sign-up/email", {
      body: { name: "Ana", email: "ana@test.local", password: PASSWORD },
      jar,
    });
    expect(signUp.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: jar.header() }) })).toMatchObject({
      user: { email: "ana@test.local" },
    });

    const signedIn = await routeRequest("POST", "/sign-in/email", { body: { email: "ana@test.local", password: PASSWORD } });
    expect(signedIn.status).toBe(200);
  });
});

describe("con una sesión robada no se averigua la contraseña", () => {
  it("/verify-password y /change-password están cerradas, y los fallos de login siguen contando", async () => {
    const jar = await register("ana@test.local");
    for (const path of ["/verify-password", "/change-password"]) {
      for (let i = 0; i < 6; i++) {
        const body = { password: `mala-${i}`, currentPassword: `mala-${i}`, newPassword: "otra-clave-123" };
        expect((await post(path, body, jar)).status).toBe(404);
      }
    }
    // Nada cambió: la contraseña sigue siendo la misma y no hay fallos registrados por esas rutas.
    expect(await db.select().from(loginFailure)).toEqual([]);
    expect((await signIn("ana@test.local")).response.status).toBe(200);
  });

  it("verificar la contraseña desde el servidor (eliminar la cuenta) sigue funcionando", async () => {
    const jar = await register("ana@test.local");
    const headers = new Headers({ cookie: jar.header() });
    await expect(auth.api.verifyPassword({ headers, body: { password: PASSWORD } })).resolves.toMatchObject({ status: true });
  });
});

describe("con la verificación activa, los códigos solo sirven para entrar", () => {
  it("con sesión, /verify-totp responde 403 aunque el código sea correcto, sin contar fallos", async () => {
    const { jar, secret } = await adminWithTwoFactor();

    for (const code of ["000000", "123456", totp(secret)]) {
      const response = await post("/two-factor/verify-totp", { code }, jar);
      expect(response.status, code).toBe(403);
      expect(await json(response)).toMatchObject({ code: "TWO_FACTOR_ALREADY_VERIFIED" });
    }
    const [row] = await db.select({ failed: twoFactor.failedVerificationCount }).from(twoFactor);
    expect(row.failed ?? 0).toBe(0);
  });

  it("con sesión, /verify-backup-code también responde 403", async () => {
    const { jar, backupCodes } = await adminWithTwoFactor();
    const response = await post("/two-factor/verify-backup-code", { code: backupCodes[0] }, jar);
    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ code: "TWO_FACTOR_ALREADY_VERIFIED" });
  });

  it("al entrar (sin sesión todavía) el código y el de respaldo funcionan", async () => {
    const { secret, backupCodes } = await adminWithTwoFactor();

    const first = await signIn("ana@test.local");
    expect(first.body).toMatchObject({ twoFactorRedirect: true });
    expect((await post("/two-factor/verify-totp", { code: totp(secret) }, first.jar)).status).toBe(200);

    const second = await signIn("ana@test.local");
    expect((await post("/two-factor/verify-backup-code", { code: backupCodes[1] }, second.jar)).status).toBe(200);
  });
});

describe("el nombre se valida al registrarse", () => {
  it.each([
    ["más de 80 caracteres", "a".repeat(81), "El nombre puede tener máximo 80 caracteres."],
    ["solo espacios", "   ", "Escribe tu nombre."],
    ["un control de dirección", "\u202EanA", "El nombre tiene caracteres que no se permiten."],
    ["un carácter nulo", "Ana\u0000", "El nombre tiene caracteres que no se permiten."],
  ])("rechaza %s sin crear la cuenta", async (_, name, message) => {
    const response = await post("/sign-up/email", { name, email: "ana@test.local", password: PASSWORD });
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "INVALID_NAME", message });
    expect(await db.select().from(user)).toEqual([]);
  });

  it("guarda el nombre sin espacios de más", async () => {
    await post("/sign-up/email", { name: "  Ana   María\n", email: "ana@test.local", password: PASSWORD });
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.email, "ana@test.local"));
    expect(row.name).toBe("Ana María");
  });
});
