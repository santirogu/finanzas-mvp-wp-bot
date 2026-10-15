import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { session } from "@/db/schema";
import {
  enableTwoFactor,
  makeAdmin,
  register,
  sessionOf,
  signIn,
  type Jar,
} from "../../../../../test/integration/auth-http";

// Con sesiones reales: al activar la verificación en dos pasos se cierran las demás sesiones (si
// alguien había entrado antes solo con la contraseña, queda afuera).
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { finishTwoFactorSetupAction } = await import("./actions");

const as = (jar: Jar) => {
  request.cookie = jar.header();
};
const sessionsOf = async (userId: string) => db.select().from(session).where(eq(session.userId, userId));

beforeEach(() => {
  request.cookie = "";
});

describe("finishTwoFactorSetupAction", () => {
  it("cierra las demás sesiones de la cuenta y deja la actual", async () => {
    const here = await register("ana@test.local");
    const ana = await makeAdmin("ana@test.local");
    // Otra sesión abierta antes de activar la verificación (otro dispositivo, o alguien con la clave).
    const other = (await signIn("ana@test.local")).jar;
    expect(await sessionOf(other)).not.toBeNull();

    await enableTwoFactor(here);
    as(here);
    await finishTwoFactorSetupAction();

    expect(await sessionOf(here)).not.toBeNull();
    expect(await sessionOf(other)).toBeNull();
    expect(await sessionsOf(ana.id)).toHaveLength(1);
  });

  it("no toca las sesiones de otras cuentas", async () => {
    const here = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    const beto = await register("beto@test.local");
    await enableTwoFactor(here);

    as(here);
    await finishTwoFactorSetupAction();

    expect(await sessionOf(beto)).not.toBeNull();
  });

  it("sin la verificación activa no hace nada (lleva a configurarla)", async () => {
    const here = await register("ana@test.local");
    const ana = await makeAdmin("ana@test.local");
    await signIn("ana@test.local");

    as(here);
    await expect(finishTwoFactorSetupAction()).rejects.toThrow("NEXT_REDIRECT:/admin/verificacion");
    expect(await sessionsOf(ana.id)).toHaveLength(2);
  });

  it("un usuario normal recibe 404 y no se cierra nada", async () => {
    const here = await register("beto@test.local");
    const other = (await signIn("beto@test.local")).jar;

    as(here);
    await expect(finishTwoFactorSetupAction()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await sessionOf(other)).not.toBeNull();
  });

  it("sin sesión lleva al login", async () => {
    await expect(finishTwoFactorSetupAction()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
  });
});
