import { randomInt } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { findAccountRole, listAdmins, setRole } from "@/modules/account/terminal";
import { updateUserFromServer } from "../../test/integration/auth-http";
import { auth } from "./auth";

// Roles con Better Auth y la base de verdad. Cada prueba intenta un camino para que alguien se dé
// el rol de admin a sí mismo; ninguno debe funcionar. El único camino válido es setRole, que solo
// usa el comando de terminal pnpm admin:grant.

const PASSWORD = "clave-segura-123";
const ORIGIN = new URL(auth.options.baseURL!).origin;
// Cada pedido sale de una IP distinta: el límite de intentos por IP no es lo que se prueba aquí.
const someIp = () => `198.51.100.${randomInt(1, 255)}`;

/** Un pedido HTTP a Better Auth, como lo haría un navegador (o alguien con curl). */
function post(path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": someIp(),
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

/** Registra una cuenta por HTTP y devuelve la cookie de sesión. */
async function register(email: string, extra: Record<string, unknown> = {}) {
  const response = await post("/sign-up/email", { name: "Ana", email, password: PASSWORD, ...extra });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");
  return cookie;
}

const roleInDb = async (email: string) =>
  (await db.select({ role: user.role }).from(user).where(eq(user.email, email)))[0]?.role;

const roleInSession = async (cookie: string) =>
  (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.role;

describe("rol al registrarse", () => {
  it("toda cuenta nueva es usuario, en la base y en la sesión", async () => {
    const cookie = await register("ana@test.local");
    expect(await roleInDb("ana@test.local")).toBe("user");
    expect(await roleInSession(cookie)).toBe("user");
  });

  it.each([
    ["role: admin", { role: "admin" }],
    ["role: ADMIN", { role: "ADMIN" }],
    ["role en una lista", { role: ["admin"] }],
    ["role como objeto", { role: { set: "admin" } }],
  ])("ignora el rol que mande el cliente (%s)", async (_, extra) => {
    const cookie = await register("ana@test.local", extra);
    expect(await roleInDb("ana@test.local")).toBe("user");
    expect(await roleInSession(cookie)).toBe("user");
  });

  it("también desde el servidor (auth.api), por si algún día se registra a alguien desde código", async () => {
    await auth.api.signUpEmail({
      body: { name: "Beto", email: "beto@test.local", password: PASSWORD, role: "admin" } as never,
    });
    expect(await roleInDb("beto@test.local")).toBe("user");
  });

  it("la base pone 'user' aunque se inserte una cuenta sin rol", async () => {
    await db.insert(user).values({ id: "sin-rol", name: "Caro", email: "caro@test.local" });
    expect(await roleInDb("caro@test.local")).toBe("user");
  });
});

describe("nadie puede cambiarse el rol desde la app", () => {
  it("la ruta 'actualizar perfil' está apagada: responde 404 y no cambia nada", async () => {
    const cookie = await register("ana@test.local");
    for (const body of [{ role: "admin" }, { name: "Ana Admin", role: "admin" }]) {
      expect((await post("/update-user", body, cookie)).status).toBe(404);
    }
    expect(await db.select({ name: user.name, role: user.role }).from(user)).toEqual([{ name: "Ana", role: "user" }]);
  });

  // La ruta está apagada, pero `input: false` es la segunda barrera: si algún día se usa desde el
  // servidor, tampoco debe dejar cambiar el rol.
  it.each([
    ["solo el rol", { role: "admin" }],
    ["el rol junto con el nombre", { name: "Ana Admin", role: "admin" }],
    ["el rol en mayúsculas", { role: "ADMIN" }],
    ["el rol en una lista", { role: ["admin"] }],
  ])("'actualizar perfil' desde el servidor rechaza %s y no cambia nada", async (_, body) => {
    const cookie = await register("ana@test.local");

    expect(await updateUserFromServer(body, cookie)).toEqual({ status: 400, code: "FIELD_NOT_ALLOWED" });

    const [row] = await db.select().from(user).where(eq(user.email, "ana@test.local"));
    expect(row).toMatchObject({ role: "user", name: "Ana" });
    expect(await roleInSession(cookie)).toBe("user");
  });

  it("un admin tampoco puede cambiarse el rol (ni bajárselo)", async () => {
    const cookie = await register("ana@test.local");
    const account = await findAccountRole("ana@test.local");
    await setRole(account!.id, "admin");

    expect((await post("/update-user", { role: "user" }, cookie)).status).toBe(404);
    expect((await updateUserFromServer({ role: "user" }, cookie)).status).toBe(400);
    expect(await roleInDb("ana@test.local")).toBe("admin");
  });

  it("sin sesión, 'actualizar perfil' no hace nada", async () => {
    await register("ana@test.local");
    expect((await post("/update-user", { role: "admin" })).status).toBe(404);
    expect((await updateUserFromServer({ role: "admin" })).status).toBe(401);
    expect(await roleInDb("ana@test.local")).toBe("user");
  });

  it.each(["/admin/set-role", "/admin/create-user", "/admin/impersonate-user", "/admin/list-users"])(
    "no existe el endpoint %s (no usamos el plugin admin de Better Auth)",
    async (path) => {
      const cookie = await register("ana@test.local");
      const response = await post(path, { userId: "x", role: "admin" }, cookie);
      expect(response.status).toBe(404);
      expect(await roleInDb("ana@test.local")).toBe("user");
    },
  );
});

describe("la base solo acepta roles válidos", () => {
  it.each(["superadmin", "ADMIN", "", "root"])("rechaza el rol %j", async (role) => {
    await register("ana@test.local");
    await expect(
      db.execute(sql`update "user" set role = ${role} where email = 'ana@test.local'`),
    ).rejects.toThrow();
    expect(await roleInDb("ana@test.local")).toBe("user");
  });

  it("no acepta un rol vacío (null)", async () => {
    await register("ana@test.local");
    await expect(db.execute(sql`update "user" set role = null where email = 'ana@test.local'`)).rejects.toThrow();
  });
});

describe("dar y quitar el rol (lo que usa pnpm admin:grant / admin:revoke)", () => {
  it("el cambio se ve en la sesión de inmediato, sin volver a iniciar sesión", async () => {
    const cookie = await register("ana@test.local");
    const account = await findAccountRole("ana@test.local");

    expect(await setRole(account!.id, "admin")).toBe(true);
    expect(await roleInSession(cookie)).toBe("admin");

    expect(await setRole(account!.id, "user")).toBe(true);
    expect(await roleInSession(cookie)).toBe("user");
  });

  it("solo cambia la cuenta indicada", async () => {
    await register("ana@test.local");
    await register("beto@test.local");
    const ana = await findAccountRole("ana@test.local");

    await setRole(ana!.id, "admin");

    expect(await roleInDb("ana@test.local")).toBe("admin");
    expect(await roleInDb("beto@test.local")).toBe("user");
  });

  it("findAccountRole busca el correo sin importar mayúsculas ni espacios, y solo ese", async () => {
    await register("ana@test.local");
    expect(await findAccountRole("  ANA@test.local ")).toMatchObject({
      email: "ana@test.local",
      name: "Ana",
      role: "user",
      timezone: "America/Bogota",
      createdAt: expect.any(Date),
    });
    expect(await findAccountRole("ana@test")).toBeNull();
    expect(await findAccountRole("nadie@test.local")).toBeNull();
  });

  it("setRole devuelve false si la cuenta no existe", async () => {
    expect(await setRole("no-existe", "admin")).toBe(false);
  });

  it("listAdmins muestra solo los admins, del más antiguo al más nuevo", async () => {
    await db.insert(user).values([
      { id: "a", name: "Ana", email: "ana@test.local", role: "admin", createdAt: new Date("2026-02-01") },
      { id: "b", name: "Beto", email: "beto@test.local", role: "user", createdAt: new Date("2026-01-01") },
      { id: "c", name: "Caro", email: "caro@test.local", role: "admin", createdAt: new Date("2026-01-15") },
    ]);
    expect((await listAdmins()).map((a) => a.email)).toEqual(["caro@test.local", "ana@test.local"]);
  });

  it("borrar la cuenta de un admin no deja nada suelto", async () => {
    const cookie = await register("ana@test.local");
    const account = await findAccountRole("ana@test.local");
    await setRole(account!.id, "admin");
    await db.delete(user).where(eq(user.id, account!.id));

    expect(await listAdmins()).toEqual([]);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
});
