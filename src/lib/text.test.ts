import { describe, expect, it } from "vitest";
import { initialsOf, withoutControlChars } from "./text";

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

describe("initialsOf", () => {
  it("la primera letra de las dos primeras palabras, en mayúscula", () => {
    expect(initialsOf("Santiago Rodriguez Gutierrez", "s@test.local")).toBe("SR");
    expect(initialsOf("ana pérez", "a@test.local")).toBe("AP");
    expect(initialsOf("  María   Fernanda ", "m@test.local")).toBe("MF");
  });

  it("con un solo nombre, una letra; respeta las tildes y la ñ", () => {
    expect(initialsOf("Ana", "a@test.local")).toBe("A");
    expect(initialsOf("ángela ñañez", "a@test.local")).toBe("ÁÑ");
  });

  it("sin nombre, la primera letra del correo (y si tampoco hay, un signo de pregunta)", () => {
    expect(initialsOf("", "beto@test.local")).toBe("B");
    expect(initialsOf("   ", " carla@test.local")).toBe("C");
    expect(initialsOf("", "")).toBe("?");
  });

  it("un emoji al comienzo cuenta como una sola letra (no se parte)", () => {
    expect(initialsOf("🙂 Ana", "a@test.local")).toBe("🙂A");
  });
});
