import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parseAccountName } from "./account-name";

describe("parseAccountName", () => {
  it.each([
    ["Ana", "Ana"],
    ["  Ana  Pérez ", "Ana Pérez"],
    ["Ana\tPérez\n", "Ana Pérez"],
    ["José-María O'Neil", "José-María O'Neil"],
    ["Ana 👩\u200D💻", "Ana 👩\u200D💻"],
  ])("acepta %j como %j", (raw, value) => {
    expect(parseAccountName(raw)).toEqual({ ok: true, value });
  });

  it("acepta hasta el máximo, contando los emojis como un carácter", () => {
    expect(MAX_NAME_LENGTH).toBe(80);
    expect(parseAccountName("a".repeat(80))).toEqual({ ok: true, value: "a".repeat(80) });
    expect(parseAccountName("😀".repeat(80))).toMatchObject({ ok: true });
  });

  it("rechaza un nombre de más de 80 caracteres", () => {
    expect(parseAccountName("a".repeat(81))).toEqual({
      ok: false,
      error: "El nombre puede tener máximo 80 caracteres.",
    });
    expect(parseAccountName("😀".repeat(81))).toMatchObject({ ok: false });
  });

  it.each(["", "   ", "\n\t", null, undefined, 42, ["Ana"], { name: "Ana" }])("rechaza %j: no hay nombre", (raw) => {
    expect(parseAccountName(raw)).toEqual({ ok: false, error: "Escribe tu nombre." });
  });

  it.each([
    ["un carácter nulo", "Ana\u0000"],
    ["un control", "Ana\u0007"],
    ["un espacio de ancho cero", "A\u200Bna"],
    ["una marca de dirección", "Ana\u200F"],
    ["un control de dirección que invierte el texto", "\u202EanA"],
    ["un aislamiento de dirección", "\u2067Ana\u2069"],
    ["la unión de palabras invisible", "Ana\u2060"],
    ["el BOM", "\uFEFFAna"],
  ])("rechaza %s", (_, raw) => {
    expect(parseAccountName(raw)).toEqual({ ok: false, error: "El nombre tiene caracteres que no se permiten." });
  });
});
