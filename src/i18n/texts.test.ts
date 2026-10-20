import { describe, expect, it } from "vitest";
import { texts } from "./texts";

describe("texts", () => {
  it("junta el español con los demás idiomas", () => {
    const t = texts({ hello: "Hola", count: (n: number) => `${n} movimientos` }, { en: { hello: "Hello", count: (n) => `${n} transactions` } });
    expect(t.es.hello).toBe("Hola");
    expect(t.en.hello).toBe("Hello");
    expect(t.en.count(3)).toBe("3 transactions");
  });

  it("TypeScript exige las mismas claves en cada idioma", () => {
    // @ts-expect-error: al inglés le falta "bye".
    texts({ hello: "Hola", bye: "Chao" }, { en: { hello: "Hello" } });
    // @ts-expect-error: el inglés tiene una clave que el español no.
    texts({ hello: "Hola" }, { en: { hello: "Hello", extra: "?" } });
    // @ts-expect-error: falta el inglés.
    texts({ hello: "Hola" }, {});
    expect(true).toBe(true);
  });
});
