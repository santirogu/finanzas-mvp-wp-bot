import { describe, expect, it } from "vitest";
import { THEMES, THEME_LABELS, parseTheme } from "./theme";

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
