import { beforeEach, describe, expect, it, vi } from "vitest";

const root = vi.hoisted(() => ({ lang: "es" as string | undefined }));
vi.mock("next/root-params", () => ({ lang: async () => root.lang }));

const { getDictionary, getLocale } = await import("./server");
const { es } = await import("./dictionaries/es");

describe("el idioma de la página", () => {
  beforeEach(() => {
    root.lang = "es";
  });

  it("sale del segmento [lang] (lo pone el proxy), con sus textos", async () => {
    expect(await getLocale()).toBe("es");
    expect(await getDictionary()).toBe(es);
  });

  it("con un segmento que no es un idioma, el de por defecto", async () => {
    root.lang = "fr";
    expect(await getLocale()).toBe("es");
    root.lang = undefined;
    expect(await getDictionary()).toBe(es);
  });
});
