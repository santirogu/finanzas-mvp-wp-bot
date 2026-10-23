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

const { TWO_FACTOR_SETUP_PATH, canAdminister, getCurrentUser, requireAdmin, requireAdminRole, requireSuperAdmin, requireUser } =
  await import("./session");

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

// Con llaves: mockReset() devuelve el mock y, si el hook lo devolviera, Vitest lo llamaría como
// limpieza al terminar cada prueba (una llamada de más, que fallaría si el mock lanza un error).
beforeEach(() => {
  mocks.getSession.mockReset();
});

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
      superAdmin: false,
      twoFactorEnabled: false,
    });
    const { headers } = mocks.getSession.mock.calls[0][0];
    expect(headers.get("cookie")).toBe("sesion=1");
  });

  it("una cuenta suspendida no tiene sesión, aunque le quede una (se cierran al suspenderla)", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, suspendedAt: new Date("2026-10-15T15:00:00Z") } });
    expect(await getCurrentUser()).toBeNull();
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, suspendedAt: null } });
    expect(await getCurrentUser()).toMatchObject({ id: "u1" });
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
    expect(TWO_FACTOR_SETUP_PATH).toBe("/admin/seguridad");
    for (const twoFactorEnabled of [false, undefined, "true"]) {
      mocks.getSession.mockResolvedValue(admin(twoFactorEnabled));
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/seguridad");
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
      superAdmin: false,
      twoFactorEnabled: true,
    });
  });
});

describe("canAdminister (lo de admin fuera de /admin, sin redirigir)", () => {
  const user = { id: "u1", name: "Ana", email: "ana@test.local", timezone: "America/Bogota", currency: "COP", superAdmin: false };

  it("solo con el rol de admin y la verificación en dos pasos, como requireAdmin", () => {
    expect(canAdminister({ ...user, role: "admin", twoFactorEnabled: true })).toBe(true);
    expect(canAdminister({ ...user, role: "admin", superAdmin: true, twoFactorEnabled: true })).toBe(true);
    expect(canAdminister({ ...user, role: "admin", twoFactorEnabled: false })).toBe(false);
    expect(canAdminister({ ...user, role: "user", twoFactorEnabled: true })).toBe(false);
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

describe("requireSuperAdmin (dar y quitar el rol de admin)", () => {
  it("expone la marca en la sesión (solo true cuenta)", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role: "admin", superAdmin: true } });
    expect(await getCurrentUser()).toMatchObject({ superAdmin: true });
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, role: "admin", superAdmin: "true" } });
    expect(await getCurrentUser()).toMatchObject({ superAdmin: false });
  });

  it("al super admin con la verificación activa lo deja pasar", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...admin(true).user, superAdmin: true } });
    expect(await requireSuperAdmin()).toMatchObject({ id: "u1", role: "admin", superAdmin: true, twoFactorEnabled: true });
  });

  it("a cualquier otro admin le responde 404, como a quien no es admin", async () => {
    mocks.getSession.mockResolvedValue(admin(true));
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("la marca sin el rol de admin no sirve (404)", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...sessionUser, superAdmin: true, twoFactorEnabled: true } });
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("también exige la verificación en dos pasos, y la sesión", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...admin(false).user, superAdmin: true } });
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT:/admin/seguridad");
    mocks.getSession.mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toThrow("NEXT_REDIRECT:/login?sesion=vencida");
  });
});
