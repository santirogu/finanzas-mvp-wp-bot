import { describe, expect, it } from "vitest";
import { withoutControlChars } from "./text";

describe("withoutControlChars", () => {
  it("quita los caracteres de control, incluido el nulo y el 127", () => {
    expect(withoutControlChars("a\u0000b\u0007c\u007Fd")).toBe("abcd");
    expect(withoutControlChars("a\tb\nc\rd")).toBe("abcd");
  });

  it("deja el resto igual: espacios, tildes, eñes y emojis", () => {
    expect(withoutControlChars(" Almuerzo con José, ñandú 🍔 ")).toBe(" Almuerzo con José, ñandú 🍔 ");
    expect(withoutControlChars("")).toBe("");
  });
});
