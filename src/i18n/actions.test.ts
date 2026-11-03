import { beforeEach, describe, expect, it, vi } from "vitest";

// El selector de idioma sin sesión: guarda la cookie y vuelve a la misma página, nunca a otra dirección.
const jar = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: jar.set }) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

const { chooseLanguageAction } = await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  jar.set.mockReset();
});

describe("chooseLanguageAction", () => {
  it("guarda el idioma en la cookie (un año, solo para el servidor) y vuelve a la misma página", async () => {
    await expect(chooseLanguageAction(form({ locale: "en", to: "/login" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(jar.set).toHaveBeenCalledWith("idioma", "en", expect.objectContaining({ path: "/", maxAge: 365 * 24 * 60 * 60, httpOnly: true, sameSite: "lax" }));
    await expect(chooseLanguageAction(form({ locale: "es", to: "/registro" }))).rejects.toThrow("NEXT_REDIRECT /registro");
    await expect(chooseLanguageAction(form({ locale: "es", to: "/" }))).rejects.toThrow("NEXT_REDIRECT /");
    await expect(chooseLanguageAction(form({ locale: "en", to: "/ayuda" }))).rejects.toThrow("NEXT_REDIRECT /ayuda");
  });

  it("solo vuelve a la portada, el login, el registro o la Ayuda: cualquier otra dirección, a la portada", async () => {
    for (const to of ["https://otro.example", "//otro.example", "/dashboard", "/login?x=1", "/ayuda-publica", ""]) {
      await expect(chooseLanguageAction(form({ locale: "en", to })), to).rejects.toThrow(/^NEXT_REDIRECT \/$/);
    }
    await expect(chooseLanguageAction(form({ locale: "en" }))).rejects.toThrow(/^NEXT_REDIRECT \/$/);
  });

  it("un idioma que la app no tiene no cambia la cookie", async () => {
    await expect(chooseLanguageAction(form({ locale: "fr", to: "/login" }))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(jar.set).not.toHaveBeenCalled();
  });
});
