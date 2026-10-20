import { describe, expect, it } from "vitest";
import { botModel } from "./claude-extractor";
import {
  formatCost,
  LONG_PROMPT_TOKENS,
  PRICED_MODELS,
  PRICES_CHECKED_ON,
  PRICES_SOURCE,
  priceOf,
  totalCost,
  usageCost,
} from "./pricing";

const usage = (model: string, inputTokens: number, outputTokens: number, longPrompt = false) => ({
  model,
  longPrompt,
  inputTokens,
  outputTokens,
});

describe("priceOf", () => {
  it("el modelo por defecto del bot tiene precio (si se cambia de modelo, hay que agregarlo)", () => {
    expect(priceOf(botModel())).not.toBeNull();
  });

  it("dice de dónde salen los precios y cuándo se revisaron", () => {
    expect(PRICES_SOURCE).toBe("https://platform.claude.com/docs/en/about-claude/pricing");
    expect(PRICES_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    ["claude-haiku-5-5", 0.1, 0.5],
    ["claude-haiku-4-5", 1, 5],
    ["claude-sonnet-5-5", 2, 10],
    ["claude-sonnet-5", 2, 10],
    ["claude-sonnet-4-6", 3, 15],
    ["claude-sonnet-4-5", 3, 15],
    ["claude-opus-5-5", 4, 20],
    ["claude-opus-5", 5, 25],
    ["claude-opus-4-8", 5, 25],
    ["claude-opus-4-7", 5, 25],
    ["claude-opus-4-6", 5, 25],
    ["claude-opus-4-5", 5, 25],
    ["claude-fable-5-1", 10, 50],
    ["claude-fable-5", 10, 50],
  ])("%s: US$%s de entrada y US$%s de salida por millón de tokens", (model, input, output) => {
    expect(priceOf(model)).toMatchObject({ input, output });
  });

  it("todos los de la tabla están probados arriba", () => {
    expect(PRICED_MODELS).toHaveLength(14);
  });

  it("con fecha en el id (como responde la API), el mismo precio", () => {
    expect(priceOf("claude-haiku-4-5-20251001")).toMatchObject({ input: 1, output: 5 });
    expect(priceOf("claude-sonnet-5-20260301")).toMatchObject({ input: 2, output: 10 });
  });

  it("en la tabla, un id que empieza como otro va antes que él (si no, se cobraría el precio del más corto)", () => {
    PRICED_MODELS.forEach((key, i) => {
      for (const later of PRICED_MODELS.slice(i + 1)) expect(later.startsWith(key), `${later} va antes que ${key}`).toBe(false);
    });
  });

  it("si dos coinciden, gana el más largo (Sonnet 5.5 no es Sonnet 5, Fable 5.1 no es Fable 5)", () => {
    expect(priceOf("claude-opus-5-5")).toMatchObject({ input: 4 });
    expect(priceOf("claude-fable-5-1")).toBe(priceOf("claude-fable-5-1-20260901"));
    expect(priceOf("claude-opus-5-5")).not.toBe(priceOf("claude-opus-5"));
  });

  it("un modelo que no está en la tabla no tiene precio (no se inventa)", () => {
    for (const model of ["claude-haiku-3-5", "claude-3-opus", "gpt-5", "", "haiku"]) expect(priceOf(model), model).toBeNull();
  });
});

describe("usageCost", () => {
  it("entrada y salida, cada una a su precio por millón", () => {
    // 35.000 × 0,10 + 4.805 × 0,50, por millón.
    expect(usageCost(usage("claude-haiku-5-5", 35_000, 4_805))).toBeCloseTo(0.0059025, 10);
    expect(usageCost(usage("claude-sonnet-4-6", 1_000_000, 1_000_000))).toBe(18);
  });

  it("Haiku 5.5 con prompts de más de 100.000 tokens, al precio de prompt largo", () => {
    expect(LONG_PROMPT_TOKENS).toBe(100_000);
    expect(usageCost(usage("claude-haiku-5-5", 1_000_000, 1_000_000, true))).toBe(3);
    expect(usageCost(usage("claude-haiku-5-5", 1_000_000, 1_000_000, false))).toBeCloseTo(0.6, 10);
  });

  it("los modelos sin precio de prompt largo cobran lo mismo", () => {
    expect(usageCost(usage("claude-sonnet-4-6", 1_000_000, 0, true))).toBe(3);
  });

  it("un modelo sin precio da null", () => {
    expect(usageCost(usage("otro-modelo", 1000, 1000))).toBeNull();
  });

  it("sin tokens, cero", () => {
    expect(usageCost(usage("claude-haiku-5-5", 0, 0))).toBe(0);
  });
});

describe("totalCost", () => {
  it("suma los grupos con precio y nombra los que no tienen (una vez cada uno, en orden)", () => {
    const result = totalCost([
      usage("claude-haiku-5-5", 1_000_000, 0),
      usage("zeta-modelo", 5, 5),
      usage("claude-haiku-5-5", 0, 1_000_000, true),
      usage("alfa-modelo", 1, 1),
      usage("zeta-modelo", 1, 1),
    ]);
    expect(result.usd).toBeCloseTo(0.1 + 2.5, 10);
    expect(result.unpriced).toEqual(["alfa-modelo", "zeta-modelo"]);
  });

  it("sin nada, cero y sin modelos sin precio", () => {
    expect(totalCost([])).toEqual({ usd: 0, unpriced: [] });
  });
});

describe("formatCost", () => {
  it.each([
    [0, "US$0,00"],
    [0.001, "<US$0,01"],
    [0.0049, "<US$0,01"],
    [0.005, "US$0,01"],
    [0.0731, "US$0,07"],
    [1.5, "US$1,50"],
    [1234.5, "US$1.234,50"],
    [null, "—"],
  ])("%s → %s", (usd, shown) => {
    expect(formatCost(usd)).toBe(shown);
  });
});

describe("formatCost en inglés", () => {
  it("con el formato de Estados Unidos (la página ya dice que es en dólares)", () => {
    expect(formatCost(0.07, "en")).toBe("$0.07");
    expect(formatCost(0.001, "en")).toBe("<$0.01");
    expect(formatCost(null, "en")).toBe("—");
    expect(formatCost(0.07)).toBe("US$0,07");
  });
});
