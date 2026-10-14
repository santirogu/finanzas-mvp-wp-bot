import { describe, expect, it } from "vitest";
import { suggestEmailCorrection } from "./email-typo";

describe("suggestEmailCorrection", () => {
  it.each([
    ["santiago@gmal.com", "santiago@gmail.com"],
    ["santiago@gmial.com", "santiago@gmail.com"],
    ["santiago@gmail.co", "santiago@gmail.com"],
    ["santiago@gmail.con", "santiago@gmail.com"],
    ["ana@hotmal.com", "ana@hotmail.com"],
    ["ana@hotmial.es", "ana@hotmail.es"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@yaho.com", "ana@yahoo.com"],
    ["Ana.Perez@GMAL.COM", "Ana.Perez@gmail.com"],
  ])("%s → %s", (input, expected) => {
    expect(suggestEmailCorrection(input)).toBe(expected);
  });

  it.each([
    "santiago@gmail.com",
    "ana@hotmail.es",
    "ana@mail.com",
    "ana@ymail.com",
    "ana@miempresa.co",
    "sin-arroba",
    "@gmal.com",
  ])("no sugiere nada para %s", (input) => {
    expect(suggestEmailCorrection(input)).toBeNull();
  });
});
