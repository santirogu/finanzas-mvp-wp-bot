import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar.cookies ? { value: jar.cookies[name] } : undefined) }),
}));

const { getRequestLocale } = await import("./request");

describe("getRequestLocale", () => {
  beforeEach(() => {
    jar.cookies = {};
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
});
