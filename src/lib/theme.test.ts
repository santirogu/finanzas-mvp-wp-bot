import { describe, expect, it } from "vitest";
import { THEME_COOKIE_MAX_AGE, THEMES, THEME_LABELS, isTheme, parseTheme, themeCookie, themeFromCookies } from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    [null, "system"],
    ["", "system"],
    ["Dark", "system"],
    ["azul", "system"],
    [undefined, "system"],
  ])("%j → %s", (value, expected) => {
    expect(parseTheme(value)).toBe(expected);
  });

  it("cada tema tiene su nombre en español, en el orden del selector", () => {
    expect(THEMES.map((t) => THEME_LABELS[t])).toEqual(["Sistema", "Claro", "Oscuro"]);
  });
});

describe("la cookie tema", () => {
  it("la lee entre las demás cookies; sin ella o con otro valor, null", () => {
    expect(themeFromCookies("idioma=es; tema=dark; otra=1")).toBe("dark");
    expect(themeFromCookies("tema=system")).toBe("system");
    expect(themeFromCookies("idioma=es")).toBeNull();
    expect(themeFromCookies("tema=azul")).toBeNull();
    expect(themeFromCookies("mitema=dark")).toBeNull();
    expect(themeFromCookies("")).toBeNull();
  });

  it("para todo el sitio, por un año, legible por el script y, con https, segura", () => {
    expect(THEME_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(themeCookie("dark", false)).toBe("tema=dark; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(themeCookie("light", true)).toBe("tema=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("isTheme: solo las tres de la app", () => {
    expect(THEMES.every(isTheme)).toBe(true);
    for (const value of ["", "Dark", "azul", null, undefined, 1]) expect(isTheme(value)).toBe(false);
  });
});
