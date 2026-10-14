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
  ])("%s → %d", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["", "abc", "0", "$0", "-", "-5.000", "$-500.000", "5.000-"])("rechaza %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("usa dos decimales en monedas distintas al peso", () => {
    expect(formatMoney(1234.5, "USD").replace(/\s/g, " ")).toBe("US$ 1.234,50");
  });

  it("formatea pesos colombianos sin decimales", () => {
    expect(formatMoney(500000).replace(/\s/g, " ")).toBe("$ 500.000");
  });
});

describe("formatMoney · pesos con decimales", () => {
  it("redondea los pesos colombianos, sin mostrar centavos", () => {
    expect(formatMoney(1234.5).replace(/\s/g, " ")).toBe("$ 1.235");
  });
});

describe("parseAmountInput · espacios", () => {
  it("quita los decimales aunque haya espacios alrededor", () => {
    expect(parseAmountInput("  45.900,50  ")).toBe(45900);
  });
});
