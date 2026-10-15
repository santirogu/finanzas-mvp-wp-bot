import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { loginFailure, session, user } from "@/db/schema";
import { ACCOUNT_SUSPENDED } from "@/lib/auth-errors";
import { PASSWORD, json, post, register, sessionOf, signIn } from "../../../test/integration/auth-http";
import { createUser } from "../../../test/integration/factories";
import { isSuspended } from "./suspension";

// Una cuenta suspendida, con Better Auth de verdad (pedidos HTTP como los de un navegador): no
// puede abrir sesiones y nadie se quita la suspensión desde la app.

const suspend = (id: string, at = new Date()) => db.update(user).set({ suspendedAt: at }).where(eq(user.id, id));
const idOf = async (email: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, email)))[0].id;

describe("isSuspended", () => {
  it("dice si la cuenta está suspendida; una que no existe, no", async () => {
    const ana = await createUser();
    const beto = await createUser({ suspendedAt: new Date() });
    expect(await isSuspended(ana.id)).toBe(false);
    expect(await isSuspended(beto.id)).toBe(true);
    expect(await isSuspended("no-existe")).toBe(false);
  });
});

describe("iniciar sesión con la cuenta suspendida", () => {
  it("con la contraseña correcta responde que está suspendida (sin el motivo) y no abre sesión", async () => {
    await register("ana@test.local");
    await suspend(await idOf("ana@test.local"));
    await db.update(user).set({ suspensionReason: "Motivo interno" }).where(eq(user.email, "ana@test.local"));

    const { jar, response, body } = await signIn("ana@test.local");
    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: "ACCOUNT_SUSPENDED", message: ACCOUNT_SUSPENDED });
    expect(JSON.stringify(body)).not.toContain("Motivo interno");
    expect(jar.has("session_token")).toBe(false);
    expect(await sessionOf(jar)).toBeNull();
    // Ni una sesión guardada en la base (solo la del registro, que se borra al suspender en la app).
    const sessions = await db.select().from(session).where(eq(session.userId, await idOf("ana@test.local")));
    expect(sessions).toHaveLength(1);
  });

  it("con una contraseña equivocada no revela nada: el mismo error de siempre, y cuenta para el bloqueo", async () => {
    await register("ana@test.local");
    await suspend(await idOf("ana@test.local"));
    const { response, body } = await signIn("ana@test.local", "otra-clave-123");
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "ana@test.local"))).toHaveLength(1);
  });

  it("al intentar entrar suspendida no cuenta como contraseña equivocada", async () => {
    await register("ana@test.local");
    await suspend(await idOf("ana@test.local"));
    for (let i = 0; i < 6; i++) await signIn("ana@test.local");
    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "ana@test.local"))).toEqual([]);
  });

  it("reactivada, vuelve a entrar", async () => {
    await register("ana@test.local");
    const id = await idOf("ana@test.local");
    await suspend(id);
    expect((await signIn("ana@test.local")).response.status).toBe(403);
    await db.update(user).set({ suspendedAt: null }).where(eq(user.id, id));
    const { jar, response } = await signIn("ana@test.local");
    expect(response.status).toBe(200);
    expect((await sessionOf(jar))?.user.email).toBe("ana@test.local");
  });

  it("solo esa cuenta: las demás entran normal", async () => {
    await register("ana@test.local");
    await register("beto@test.local");
    await suspend(await idOf("ana@test.local"));
    expect((await signIn("beto@test.local")).response.status).toBe(200);
  });
});

describe("nadie se quita (ni se pone) la suspensión desde la app", () => {
  it("'actualizar perfil' rechaza suspendedAt", async () => {
    const jar = await register("ana@test.local");
    for (const value of [new Date().toISOString(), "2020-01-01"]) {
      const response = await post("/update-user", { suspendedAt: value }, jar);
      expect(response.status, value).toBe(400);
      expect(await json(response)).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
    }
    // null (lo que mandaría alguien para quitársela) también se rechaza: no queda nada que cambiar.
    expect((await post("/update-user", { suspendedAt: null }, jar)).status).toBe(400);
    expect(await isSuspended(await idOf("ana@test.local"))).toBe(false);
  });

  it("el registro ignora un suspendedAt que mande el cliente", async () => {
    const response = await post("/sign-up/email", { name: "Ana", email: "ana@test.local", password: PASSWORD, suspendedAt: null });
    expect([200, 400]).toContain(response.status);
    const [row] = await db.select({ suspendedAt: user.suspendedAt }).from(user).where(eq(user.email, "ana@test.local"));
    expect(row?.suspendedAt ?? null).toBeNull();
  });
});
