import { randomInt } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAccountRole, setRole } from "@/modules/account/admin";

// requireUser y requireAdmin con una sesión real de Better Auth y el rol leído de la base. Solo se
// simulan las piezas de Next.js: las cabeceras del pedido, el redirect y el 404.
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

const { auth } = await import("./auth");
const session = await import("./session");

const ORIGIN = new URL(auth.options.baseURL!).origin;

/** Registra una cuenta por HTTP y deja su cookie como la del "pedido" actual. */
async function signUp(email: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `198.51.100.${randomInt(1, 255)}` },
      body: JSON.stringify({ name: "Ana", email, password: "clave-segura-123" }),
    }),
  );
  expect(response.status).toBe(200);
  request.cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return (await findAccountRole(email))!;
}

// cache() de React (en getCurrentUser) solo guarda dentro de un render: aquí cada llamada lee la
// sesión de nuevo, como un pedido nuevo.
const { requireAdmin } = session;

beforeEach(() => {
  request.cookie = "";
});

describe("requireAdmin con sesiones reales", () => {
  it("sin sesión lleva al login", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("con una cookie inventada lleva al login", async () => {
    request.cookie = "better-auth.session_token=inventada.firma";
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("una cuenta recién registrada es usuario: entra a lo de usuario pero no a lo de admin", async () => {
    await signUp("ana@test.local");
    expect(await session.requireUser()).toMatchObject({ email: "ana@test.local", role: "user" });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("al darle el rol entra a lo de admin desde el siguiente pedido, y al quitárselo deja de entrar", async () => {
    const ana = await signUp("ana@test.local");

    await setRole(ana.id, "admin");
    expect(await requireAdmin()).toMatchObject({ id: ana.id, role: "admin" });
    // Un admin también es usuario.
    expect(await session.requireUser()).toMatchObject({ id: ana.id, role: "admin" });

    await setRole(ana.id, "user");
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("el rol de otra cuenta no le sirve a nadie más", async () => {
    const ana = await signUp("ana@test.local");
    await setRole(ana.id, "admin");
    await signUp("beto@test.local");

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("después de cerrar sesión, la cookie de admin ya no sirve", async () => {
    const ana = await signUp("ana@test.local");
    await setRole(ana.id, "admin");
    const cookie = request.cookie;

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
