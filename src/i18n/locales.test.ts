import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, localeOf, withoutLocale } from "./locales";
import { DICTIONARIES } from "./dictionaries";

describe("idiomas", () => {
  it("el español es el de por defecto, y la cookie se llama idioma", () => {
    expect(LOCALES).toContain("es");
    expect(DEFAULT_LOCALE).toBe("es");
    expect(LOCALE_COOKIE).toBe("idioma");
  });

  it("cada idioma tiene sus textos", () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LOCALES].sort());
  });

  it("isLocale: solo los idiomas de la app, escritos igual", () => {
    expect(isLocale("es")).toBe(true);
    for (const value of ["fr", "ES", "es-CO", "", undefined, null, 1]) expect(isLocale(value), String(value)).toBe(false);
  });

  it("localeOf: el de la cookie si es uno de la app; si no, el de por defecto", () => {
    expect(localeOf("es")).toBe("es");
    expect(localeOf("fr")).toBe(DEFAULT_LOCALE);
    expect(localeOf(undefined)).toBe(DEFAULT_LOCALE);
  });
});

describe("withoutLocale", () => {
  it("quita el idioma de adelante", () => {
    expect(withoutLocale("/es/dashboard")).toBe("/dashboard");
    expect(withoutLocale("/es/movimientos/123/editar")).toBe("/movimientos/123/editar");
    expect(withoutLocale("/es")).toBe("/");
    expect(withoutLocale("/es/")).toBe("/");
  });

  it("deja igual lo que no empieza con un idioma", () => {
    for (const path of ["/dashboard", "/", "/espacio", "/esp/dashboard", "/fr/dashboard", "/dashboard/es"]) expect(withoutLocale(path), path).toBe(path);
  });
});
