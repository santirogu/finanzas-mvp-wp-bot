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
    // Varios dominios cercanos: gana el más parecido (yahoo.com a 1 frente a yahoo.es a 2).
    ["ana@yahoo.co", "ana@yahoo.com"],
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

describe("suggestEmailCorrection · más casos", () => {
  it.each([
    ["ana@outlok.es", "ana@outlook.es"],
    ["ana@yaho.es", "ana@yahoo.es"],
    ["ana@iclud.com", "ana@icloud.com"],
    ["ana@lve.com", "ana@live.com"],
    // Si dos dominios están cerca, gana el más parecido aunque aparezca después en la lista.
    ["ana@hotmail.cs", "ana@hotmail.es"],
    // Parte local de un solo carácter y espacios alrededor.
    ["a@gmal.com", "a@gmail.com"],
    ["  ana@gmal.com  ", "ana@gmail.com"],
  ])("%s → %s", (input, expected) => {
    expect(suggestEmailCorrection(input)).toBe(expected);
  });

  it.each([
    "ana@email.com",
    "ana@me.com",
    "ana@mac.com",
    "ana@aol.com",
    "ana@gmx.com",
    "ana@proton.me",
    "ana@protonmail.com",
  ])("no 'corrige' dominios reales parecidos a los populares: %s", (input) => {
    expect(suggestEmailCorrection(input)).toBeNull();
  });
});
