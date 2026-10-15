import { describe, expect, it } from "vitest";
import { formatMoney, parseAmountInput } from "./money";

describe("parseAmountInput", () => {
  it.each([
    ["$500.000", 500000],
    ["500.000", 500000],
    ["1.250.000", 1250000],
    ["500000", 500000],
    [" $ 12.500 ", 12500],
    ["45.900,50", 45900],
    ["45.900,5", 45900],
    // Solo se descartan los decimales del final: una coma en otro lugar se ignora.
    ["1,500", 1500],
    ["1,50.000", 150000],
  ])("%s → %d", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["", "abc", "0", "$0", "-", "-5.000", "$-500.000", "5.000-"])("rechaza %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it.each([
    [500000, "$500.000,00"],
    [1000000, "$1.000.000,00"],
    [0, "$0,00"],
    [6500, "$6.500,00"],
    [999, "$999,00"],
    [-50000, "-$50.000,00"],
    [1234.5, "$1.234,50"],
    [1234.567, "$1.234,57"],
  ])("%d → %s", (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });

  it("sin ningún espacio (ni el espacio duro que pone Intl)", () => {
    expect(formatMoney(1000000)).not.toMatch(/\s/);
  });

  it("otras monedas, igual: dos decimales y sin espacio", () => {
    expect(formatMoney(1234.5, "USD")).toBe("US$1.234,50");
  });
});

describe("parseAmountInput · espacios", () => {
  it("quita los decimales aunque haya espacios alrededor", () => {
    expect(parseAmountInput("  45.900,50  ")).toBe(45900);
  });
});
