import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string>, acceptLanguage: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar.cookies ? { value: jar.cookies[name] } : undefined) }),
  headers: async () => new Headers(jar.acceptLanguage ? { "accept-language": jar.acceptLanguage } : {}),
}));

const { getRequestLocale } = await import("./request");

describe("getRequestLocale", () => {
  beforeEach(() => {
    jar.cookies = {};
    jar.acceptLanguage = null;
  });

  it("el idioma de la cookie `idioma`, la misma con la que el proxy armó la página", async () => {
    jar.cookies = { idioma: "en" };
    expect(await getRequestLocale()).toBe("en");
    jar.cookies = { idioma: "es" };
    expect(await getRequestLocale()).toBe("es");
  });

  it("sin la cookie, o con otro valor (u otra cookie), en español", async () => {
    expect(await getRequestLocale()).toBe("es");
    jar.cookies = { idioma: "fr" };
    expect(await getRequestLocale()).toBe("es");
    jar.cookies = { lang: "en" };
    expect(await getRequestLocale()).toBe("es");
  });

  it("sin la cookie, el idioma del navegador (como el proxy); la cookie manda sobre el navegador", async () => {
    jar.acceptLanguage = "en-US,en;q=0.9";
    expect(await getRequestLocale()).toBe("en");
    jar.cookies = { idioma: "es" };
    expect(await getRequestLocale()).toBe("es");
    jar.cookies = { idioma: "fr" };
    expect(await getRequestLocale()).toBe("en");
  });
});
