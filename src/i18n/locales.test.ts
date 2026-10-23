import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  INTL_LOCALES,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALES,
  localeOf,
  withoutLocale,
} from "./locales";

describe("idiomas", () => {
  it("español e inglés; el español es el de por defecto, y la cookie se llama idioma", () => {
    expect(LOCALES).toEqual(["es", "en"]);
    expect(DEFAULT_LOCALE).toBe("es");
    expect(LOCALE_COOKIE).toBe("idioma");
  });

  it("los números y las fechas: de Colombia en español, de EE. UU. en inglés", () => {
    expect(INTL_LOCALES).toEqual({ es: "es-CO", en: "en-US" });
  });

  it("isLocale: solo los idiomas de la app, escritos igual", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    for (const value of ["fr", "ES", "EN", "es-CO", "en-US", "", undefined, null, 1]) expect(isLocale(value), String(value)).toBe(false);
  });

  it("localeOf: el de la cookie si es uno de la app; si no, el de por defecto", () => {
    expect(localeOf("es")).toBe("es");
    expect(localeOf("en")).toBe("en");
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
    expect(withoutLocale("/en/ayuda")).toBe("/ayuda");
    expect(withoutLocale("/en")).toBe("/");
  });

  it("deja igual lo que no empieza con un idioma", () => {
    for (const path of ["/dashboard", "/", "/espacio", "/esp/dashboard", "/fr/dashboard", "/dashboard/es", "/english", "/eng/x"]) expect(withoutLocale(path), path).toBe(path);
  });
});

describe("el idioma de un pedido (localeOf de la cookie)", () => {
  it("el de la cookie; sin ella (o con otro valor), español, aunque el navegador esté en otro idioma", () => {
    expect(localeOf("es")).toBe("es");
    expect(localeOf("en")).toBe("en");
    expect(localeOf(undefined)).toBe("es");
    expect(localeOf("fr")).toBe("es");
  });

  it("la cookie dura un año", () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
  });
});
