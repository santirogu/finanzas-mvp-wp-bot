import { describe, expect, it } from "vitest";
import { type Budget, budgetLevel, budgetProgress, budgetRows, NEAR_SHARE } from "./progress";

// Cuánto lleva cada categoría frente a su presupuesto, y sus textos.

const budget = (categoryId: string, name: string, amount: number, archived = false): Budget => ({ categoryId, name, emoji: "•", amount, archived });

describe("budgetLevel", () => {
  it(`bien hasta antes del ${NEAR_SHARE} %, cerca desde ahí y hasta el límite, pasado si lo supera`, () => {
    expect(budgetLevel(399999.99, 500000)).toBe("ok");
    expect(budgetLevel(400000, 500000)).toBe("near");
    expect(budgetLevel(500000, 500000)).toBe("near");
    expect(budgetLevel(500000.01, 500000)).toBe("over");
    expect(budgetLevel(0, 500000)).toBe("ok");
  });
});

describe("budgetProgress", () => {
  const budgets = [budget("a", "Restaurantes", 500000), budget("b", "Mercado", 1000000), budget("c", "Transporte", 300000), budget("d", "Ropa", 200000)];
  const spent = new Map([
    ["a", 410000],
    ["b", 520000],
    ["c", 310000],
    ["x", 999999],
  ]);

  it("lo que lleva cada una, del más pasado al más lejos del límite; sin egresos, cero", () => {
    expect(budgetProgress(budgets, spent).map(({ name, spent: total, share, level }) => [name, total, share, level])).toEqual([
      ["Transporte", 310000, 103, "over"],
      ["Restaurantes", 410000, 82, "near"],
      ["Mercado", 520000, 52, "ok"],
      ["Ropa", 0, 0, "ok"],
    ]);
  });

  it("si van igual, por nombre", () => {
    const tied = [budget("a", "Salud", 100), budget("b", "Café", 100)];
    expect(budgetProgress(tied, new Map()).map((p) => p.name)).toEqual(["Café", "Salud"]);
  });
});

describe("budgetRows (los textos)", () => {
  const rows = (b: Budget[], spent: Map<string, number>, locale: "es" | "en" = "es") => budgetRows(budgetProgress(b, spent, locale), "COP", locale);
  const nbsp = (s: string) => s.replace(/ /g, " ");

  it("cuánto lleva de cuánto, el porcentaje, la barra y cuánto le queda", () => {
    const [row] = rows([budget("a", "Restaurantes", 500000)], new Map([["a", 410000]]));
    expect({ ...row, share: nbsp(row.share) }).toEqual({
      categoryId: "a",
      name: "Restaurantes",
      emoji: "•",
      level: "near",
      spentOf: "$410.000,00 de $500.000,00",
      share: "82 %",
      bar: 82,
      note: "Te quedan $90.000,00",
      archived: null,
      amountInput: "500.000,00",
    });
  });

  it("si se pasó, por cuánto, y la barra llena; con miles en el porcentaje", () => {
    const [over] = rows([budget("c", "Transporte", 300000)], new Map([["c", 310000.5]]));
    expect(over).toMatchObject({ level: "over", bar: 100, note: "Te pasaste por $10.000,50" });
    const [way] = rows([budget("c", "Transporte", 1000)], new Map([["c", 12500]]));
    expect(nbsp(way.share)).toBe("1.250 %");
  });

  it("una categoría archivada lo dice", () => {
    expect(rows([budget("a", "Viajes", 100, true)], new Map())[0].archived).toBe("Categoría archivada");
  });

  it("en inglés", () => {
    const [row] = rows([budget("a", "Restaurants", 500000)], new Map([["a", 410000]]), "en");
    expect(row).toMatchObject({ spentOf: "$410,000.00 of $500,000.00", share: "82%", note: "$90,000.00 left", amountInput: "500,000.00" });
    const [over] = rows([budget("c", "Transport", 1000, true)], new Map([["c", 12500]]), "en");
    expect(over).toMatchObject({ share: "1,250%", note: "$11,500.00 over", archived: "Archived category" });
  });
});
