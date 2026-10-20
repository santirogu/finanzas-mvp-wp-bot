import { describe, expect, it } from "vitest";
import { CONFIRMATION_WORD, CONFIRMATION_WORDS } from "./confirmation";

describe("la palabra para eliminar la cuenta", () => {
  it("en el idioma de la página: ELIMINAR o DELETE", () => {
    expect(CONFIRMATION_WORDS).toEqual({ es: "ELIMINAR", en: "DELETE" });
    expect(CONFIRMATION_WORD).toBe("ELIMINAR");
  });
});
