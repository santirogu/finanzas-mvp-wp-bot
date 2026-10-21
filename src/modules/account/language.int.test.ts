import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";

// Mi cuenta → Idioma, con la base de verdad: guarda el de la cuenta de la sesión (nunca otra), lo pone en
// este navegador y vuelve a Mi cuenta con el aviso. La sesión, la cookie y la redirección se simulan.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const { saveLanguageAction } = await import("./actions");

const form = (locale?: string) => {
  const data = new FormData();
  if (locale !== undefined) data.set("locale", locale);
  return data;
};
const localeOf = async (id: string) => (await db.select({ locale: user.locale }).from(user).where(eq(user.id, id)))[0].locale;

describe("saveLanguageAction", () => {
  it("guarda el idioma de la cuenta de la sesión (no el de otra), lo pone en este navegador y vuelve a Mi cuenta", async () => {
    const ana = await createUser({ name: "Ana" });
    const beto = await createUser({ name: "Beto" });
    mocks.requireUser.mockResolvedValue(ana);
    mocks.setCookie.mockReset();

    await expect(saveLanguageAction(form("en"))).rejects.toThrow("NEXT_REDIRECT /cuenta?aviso=idioma-guardado");
    expect(await localeOf(ana.id)).toBe("en");
    expect(await localeOf(beto.id)).toBeNull();
    expect(mocks.setCookie).toHaveBeenCalledWith("idioma", "en", {
      path: "/",
      maxAge: 31_536_000,
      httpOnly: true,
      sameSite: "lax",
      // Las pruebas corren con http://localhost: sin https, la cookie no se marca segura.
      secure: false,
    });

    await expect(saveLanguageAction(form("es"))).rejects.toThrow("NEXT_REDIRECT");
    expect(await localeOf(ana.id)).toBe("es");
  });

  it.each([["fr"], [""], [undefined]])("con %j no cambia nada", async (value) => {
    const ana = await createUser();
    mocks.requireUser.mockResolvedValue(ana);
    mocks.setCookie.mockReset();
    mocks.redirect.mockClear();
    await saveLanguageAction(form(value));
    expect(await localeOf(ana.id)).toBeNull();
    expect(mocks.setCookie).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin sesión no hace nada", async () => {
    const ana = await createUser();
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    mocks.setCookie.mockReset();
    await expect(saveLanguageAction(form("en"))).rejects.toThrow("/login");
    expect(await localeOf(ana.id)).toBeNull();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
