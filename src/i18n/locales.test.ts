import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  INTL_LOCALES,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALES,
  localeOf,
  negotiateLocale,
  requestLocaleOf,
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

describe("negotiateLocale (el idioma del navegador, sin cookie)", () => {
  it.each([
    ["en-US,en;q=0.9", "en"],
    ["en", "en"],
    ["EN-gb", "en"],
    ["es-CO,es;q=0.9,en;q=0.8", "es"],
    ["fr-FR,fr;q=0.9,en;q=0.8,es;q=0.7", "en"],
    ["fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7", "es"],
    // El orden de la cabecera no importa: manda q (y con el mismo q, el que va primero).
    ["es;q=0.5,en;q=0.9", "en"],
    ["en;q=0.8,es;q=0.8", "en"],
    ["es;q=0.8,en;q=0.8", "es"],
    // q=0 es "no lo quiero"; un q que no es un número tampoco cuenta.
    ["en;q=0,fr", "es"],
    ["en;q=abc,es;q=0.1", "es"],
    ["pt-BR,pt;q=0.9", "es"],
    ["*", "es"],
    ["", "es"],
  ])("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("sin cabecera, en español; una larguísima no se recorre entera", () => {
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(`${"fr;q=0.9,".repeat(200)}en`)).toBe("es");
  });
});

describe("requestLocaleOf (cookie, y si no, el navegador)", () => {
  it("la cookie manda sobre el navegador; sin cookie (o con otro valor), el navegador", () => {
    expect(requestLocaleOf("es", "en-US")).toBe("es");
    expect(requestLocaleOf("en", "es-CO")).toBe("en");
    expect(requestLocaleOf(undefined, "en-US")).toBe("en");
    expect(requestLocaleOf("fr", "en-US")).toBe("en");
    expect(requestLocaleOf(undefined, null)).toBe("es");
  });

  it("la cookie dura un año", () => {
    expect(LOCALE_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
  });
});
