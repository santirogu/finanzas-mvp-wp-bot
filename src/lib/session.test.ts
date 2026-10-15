import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "sesion=1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

const { getCurrentUser, requireAdmin, requireUser } = await import("./session");

const sessionUser = {
  id: "u1",
  name: "Ana Pérez",
  email: "ana@test.local",
  timezone: "America/Bogota",
  currency: "COP",
  role: "user",
  emailVerified: false,
  image: null,
};

beforeEach(() => mocks.getSession.mockReset());

describe("getCurrentUser", () => {
  it("devuelve null sin sesión", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("expone solo los campos necesarios y pasa las cabeceras de la petición", async () => {
    mocks.getSession.mockResolvedValue({ user: sessionUser, session: { token: "secreto" } });

    expect(await getCurrentUser()).toEqual({
      id: "u1",
      name: "Ana Pérez",
      email: "ana@test.local",
      timezone: "America/Bogota",
      currency: "COP",
      role: "user",
    });
    const { headers } = mocks.getSession.mock.calls[0][0];
    expect(headers.get("cookie")).toBe("sesion=1");
  });

  it("usa Bogotá y COP si el usuario no tiene zona horaria o moneda", async () => {
    mocks.getSession.mockResolvedValue({
      user: { ...sessionUser, timezone: null, currency: undefined },
    });
    expect(await getCurrentUser()).toMatchObject({ timezone: "America/Bogota", currency: "COP" });
  });
});

describe("getCurrentUser · rol", () => {
  it("expone el rol de admin", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role: "admin" } });
    expect(await getCurrentUser()).toMatchObject({ role: "admin" });
  });

  it.each([undefined, null, "", "ADMIN", "Admin", " admin", "superadmin", ["admin"], { role: "admin" }, 1, true])(
    "ante un rol desconocido (%j) trata a la persona como usuario",
    async (role) => {
      mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role } });
      expect(await getCurrentUser()).toMatchObject({ role: "user" });
    },
  );
});

describe("requireUser", () => {
  it("redirige a /login sin sesión", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("devuelve el usuario con sesión", async () => {
    mocks.getSession.mockResolvedValue({ user: sessionUser });
    expect(await requireUser()).toMatchObject({ id: "u1" });
  });
});

describe("requireAdmin", () => {
  it("sin sesión redirige a /login", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("con sesión de usuario responde 404 (no revela que la sección existe)", async () => {
    mocks.getSession.mockResolvedValue({ user: sessionUser });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(["ADMIN", "superadmin", undefined, null])("con un rol desconocido (%j) también responde 404", async (role) => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("con sesión de admin devuelve el usuario", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role: "admin" } });
    expect(await requireAdmin()).toEqual({
      id: "u1",
      name: "Ana Pérez",
      email: "ana@test.local",
      timezone: "America/Bogota",
      currency: "COP",
      role: "admin",
    });
  });
});
