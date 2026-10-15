import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAccountRole, resetTwoFactor, setRole } from "@/modules/account/terminal";
import { enableTwoFactor, makeAdmin, register, signIn, post, type Jar } from "../../test/integration/auth-http";
import { totp } from "../../test/totp";

// requireUser, requireAdmin y requireAdminRole con sesiones reales de Better Auth y el rol y la
// verificación en dos pasos leídos de la base. Solo se simulan las piezas de Next.js: las cabeceras
// del pedido, el redirect y el 404.
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
// cache() de React (en getCurrentUser) solo guarda dentro de un render: aquí cada llamada lee la
// sesión de nuevo, como un pedido nuevo.
const { requireAdmin, requireAdminRole, requireUser } = await import("./session");

/** Usa las cookies de ese navegador como las del "pedido" actual. */
const as = (jar: Jar) => {
  request.cookie = jar.header();
};

beforeEach(() => {
  request.cookie = "";
});

describe("requireAdmin con sesiones reales", () => {
  it("sin sesión, o con una cookie inventada, lleva al login", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
    request.cookie = "better-auth.session_token=inventada.firma";
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
    await expect(requireAdminRole()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
  });

  it("una cuenta recién registrada es usuario: entra a lo de usuario pero no a lo de admin", async () => {
    as(await register("ana@test.local"));
    expect(await requireUser()).toMatchObject({ email: "ana@test.local", role: "user", twoFactorEnabled: false });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requireAdminRole()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("con el rol pero sin la verificación, va a configurarla; al activarla, entra", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    as(jar);

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/seguridad");
    expect(await requireAdminRole()).toMatchObject({ role: "admin", twoFactorEnabled: false });

    await enableTwoFactor(jar);
    as(jar);
    expect(await requireAdmin()).toMatchObject({ role: "admin", twoFactorEnabled: true });
    // Un admin también es usuario.
    expect(await requireUser()).toMatchObject({ role: "admin" });
  });

  it("al quitarle el rol deja de entrar en el siguiente pedido, aunque tenga la verificación", async () => {
    const jar = await register("ana@test.local");
    const ana = await makeAdmin("ana@test.local");
    await enableTwoFactor(jar);
    as(jar);
    expect(await requireAdmin()).toMatchObject({ id: ana.id });

    await setRole(ana.id, "user");

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("después de un login con los dos pasos, entra", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    const { secret } = await enableTwoFactor(jar);

    const login = await signIn("ana@test.local");
    // Solo con la contraseña no hay sesión.
    as(login.jar);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");

    await post("/two-factor/verify-totp", { code: totp(secret) }, login.jar);
    as(login.jar);
    expect(await requireAdmin()).toMatchObject({ email: "ana@test.local", twoFactorEnabled: true });
  });

  it("al reiniciar la verificación desde la terminal, la sesión se cierra y hay que configurarla de nuevo", async () => {
    const jar = await register("ana@test.local");
    const ana = await makeAdmin("ana@test.local");
    await enableTwoFactor(jar);

    await resetTwoFactor(ana.id);

    as(jar);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
    const login = await signIn("ana@test.local");
    as(login.jar);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/seguridad");
  });

  it("el rol de otra cuenta no le sirve a nadie más", async () => {
    const anaJar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    await enableTwoFactor(anaJar);
    as(await register("beto@test.local"));

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requireAdminRole()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("después de cerrar sesión, la cookie de admin ya no sirve", async () => {
    const jar = await register("ana@test.local");
    await makeAdmin("ana@test.local");
    await enableTwoFactor(jar);

    await auth.api.signOut({ headers: new Headers({ cookie: jar.header() }) });

    as(jar);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
    expect(await findAccountRole("ana@test.local")).toMatchObject({ role: "admin" });
  });
});
