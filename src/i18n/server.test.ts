import { beforeEach, describe, expect, it, vi } from "vitest";
import { texts } from "./texts";

const root = vi.hoisted(() => ({ lang: "es" as string | undefined }));
vi.mock("next/root-params", () => ({ lang: async () => root.lang }));

const { getLocale, getTexts } = await import("./server");

const GREETING = texts({ hello: "Hola" }, { en: { hello: "Hello" } });

describe("el idioma de la página", () => {
  beforeEach(() => {
    root.lang = "es";
  });

  it("sale del segmento [lang] (lo pone el proxy), con sus textos", async () => {
    expect(await getLocale()).toBe("es");
    expect(await getTexts(GREETING)).toEqual({ hello: "Hola" });
    root.lang = "en";
    expect(await getLocale()).toBe("en");
    expect(await getTexts(GREETING)).toEqual({ hello: "Hello" });
  });

  it("con un segmento que no es un idioma, el de por defecto", async () => {
    root.lang = "fr";
    expect(await getLocale()).toBe("es");
    root.lang = undefined;
    expect(await getTexts(GREETING)).toEqual({ hello: "Hola" });
  });
});
