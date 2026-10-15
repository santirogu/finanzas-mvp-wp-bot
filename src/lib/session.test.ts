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

const { TWO_FACTOR_SETUP_PATH, getCurrentUser, requireAdmin, requireAdminRole, requireUser } = await import(
  "./session"
);

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
      twoFactorEnabled: false,
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
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
  });

  it("devuelve el usuario con sesión", async () => {
    mocks.getSession.mockResolvedValue({ user: sessionUser });
    expect(await requireUser()).toMatchObject({ id: "u1" });
  });
});

describe("getCurrentUser · verificación en dos pasos", () => {
  it("expone si está activa", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, twoFactorEnabled: true } });
    expect(await getCurrentUser()).toMatchObject({ twoFactorEnabled: true });
  });

  it.each([undefined, null, false, "true", 1])("solo true cuenta como activa (%j no)", async (twoFactorEnabled) => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, twoFactorEnabled } });
    expect(await getCurrentUser()).toMatchObject({ twoFactorEnabled: false });
  });
});

const admin = (twoFactorEnabled: unknown) => ({ user: { ...sessionUser, role: "admin", twoFactorEnabled } });

describe("requireAdmin", () => {
  it("sin sesión redirige a /login", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
  });

  it("con sesión de usuario responde 404 (no revela que la sección existe)", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, twoFactorEnabled: true } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(["ADMIN", "superadmin", undefined, null])("con un rol desconocido (%j) también responde 404", async (role) => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role, twoFactorEnabled: true } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("un admin sin la verificación en dos pasos va a configurarla", async () => {
    expect(TWO_FACTOR_SETUP_PATH).toBe("/admin/verificacion");
    for (const twoFactorEnabled of [false, undefined, "true"]) {
      mocks.getSession.mockResolvedValue(admin(twoFactorEnabled));
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/verificacion");
    }
  });

  it("un admin con la verificación activa pasa", async () => {
    mocks.getSession.mockResolvedValue(admin(true));
    expect(await requireAdmin()).toEqual({
      id: "u1",
      name: "Ana Pérez",
      email: "ana@test.local",
      timezone: "America/Bogota",
      currency: "COP",
      role: "admin",
      twoFactorEnabled: true,
    });
  });
});

describe("requireAdminRole (solo para configurar la verificación)", () => {
  it("sin sesión redirige a /login y a un usuario le responde 404", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireAdminRole()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, twoFactorEnabled: true } });
    await expect(requireAdminRole()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("deja pasar a un admin con o sin la verificación", async () => {
    mocks.getSession.mockResolvedValue(admin(false));
    expect(await requireAdminRole()).toMatchObject({ role: "admin", twoFactorEnabled: false });
    mocks.getSession.mockResolvedValue(admin(true));
    expect(await requireAdminRole()).toMatchObject({ role: "admin", twoFactorEnabled: true });
  });
});
