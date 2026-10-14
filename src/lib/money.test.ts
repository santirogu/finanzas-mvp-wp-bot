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

  it.each(["", "abc", "0", "$0", "-"])("rechaza %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formatea pesos colombianos sin decimales", () => {
    expect(formatMoney(500000).replace(/\s/g, " ")).toBe("$ 500.000");
  });
});
