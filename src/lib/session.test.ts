import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "sesion=1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

const { getCurrentUser, requireUser } = await import("./session");

const sessionUser = {
  id: "u1",
  name: "Ana Pérez",
  email: "ana@test.local",
  timezone: "America/Bogota",
  currency: "COP",
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
