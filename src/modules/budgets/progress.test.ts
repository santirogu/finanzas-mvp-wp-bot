import { describe, expect, it } from "vitest";
import { type Budget, budgetAlert, budgetCrossings, budgetLevel, budgetProgress, budgetRows, NEAR_SHARE } from "./progress";

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

  it("con otro porcentaje (Valores de la app), cerca desde ese", () => {
    expect(budgetLevel(300000, 500000, 60)).toBe("near");
    expect(budgetLevel(299999.99, 500000, 60)).toBe("ok");
    expect(budgetLevel(450000, 500000, 95)).toBe("ok");
    expect(budgetLevel(500000.01, 500000, 95)).toBe("over");
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

  it("con otro porcentaje, cerca desde ese", () => {
    expect(budgetProgress(budgets, spent, "es", 50).find((b) => b.name === "Mercado")?.level).toBe("near");
    expect(budgetProgress(budgets, spent, "es", 90).find((b) => b.name === "Restaurantes")?.level).toBe("ok");
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

describe("budgetCrossings (los avisos: llegar al 80 % o pasarse, una vez)", () => {
  const mercado = budget("m", "Mercado", 500000);
  const cross = (spentAfter: number, added: number, budgets = [mercado]) =>
    budgetCrossings(budgets, new Map([["m", spentAfter]]), new Map([["m", added]])).map(({ level, spent, share }) => ({ level, spent, share }));

  it("avisa al cruzar el 80 % y al pasarse", () => {
    expect(cross(410000, 30000)).toEqual([{ level: "near", spent: 410000, share: 82 }]);
    expect(cross(400000, 0.01)).toEqual([{ level: "near", spent: 400000, share: 80 }]);
    expect(cross(510000, 30000)).toEqual([{ level: "over", spent: 510000, share: 102 }]);
  });

  it("si cruza los dos de una vez, solo el de pasarse", () => {
    expect(cross(600000, 300000)).toEqual([{ level: "over", spent: 600000, share: 120 }]);
  });

  it("con otro porcentaje, avisa al cruzar ese", () => {
    const at = (spentAfter: number, added: number, nearShare: number) =>
      budgetCrossings([mercado], new Map([["m", spentAfter]]), new Map([["m", added]]), nearShare).map(({ level }) => level);
    expect(at(260000, 20000, 50)).toEqual(["near"]);
    expect(at(410000, 30000, 90)).toEqual([]);
    expect(at(460000, 30000, 90)).toEqual(["near"]);
  });

  it("lo que ya estaba cerca o pasado no vuelve a avisar; justo en el límite todavía no se pasó", () => {
    expect(cross(450000, 30000)).toEqual([]);
    expect(cross(700000, 50000)).toEqual([]);
    expect(cross(500000, 50000)).toEqual([]);
    expect(cross(399999.99, 100)).toEqual([]);
  });

  it("sin egreso nuevo en la categoría, o sin presupuesto, nada", () => {
    expect(cross(600000, 0)).toEqual([]);
    expect(budgetCrossings([mercado], new Map([["x", 999999]]), new Map([["x", 999999]]))).toEqual([]);
    expect(cross(600000, 300000, [])).toEqual([]);
  });

  it("varias categorías a la vez", () => {
    const transporte = budget("t", "Transporte", 100000);
    const result = budgetCrossings(
      [mercado, transporte],
      new Map([
        ["m", 420000],
        ["t", 130000],
      ]),
      new Map([
        ["m", 50000],
        ["t", 40000],
      ]),
    );
    expect(result.map((c) => [c.name, c.level])).toEqual([
      ["Mercado", "near"],
      ["Transporte", "over"],
    ]);
  });
});

describe("budgetAlert (el texto del aviso)", () => {
  const nbsp = (text: string) => text.replace(/\u00a0/g, " ");
  const crossing = (level: "near" | "over", spent: number, share: number) => ({ categoryId: "m", name: "Mercado", amount: 500000, level, spent, share });

  it("cuánto lleva de cuánto, o por cuánto se pasó", () => {
    expect(nbsp(budgetAlert(crossing("near", 410000, 82), "COP"))).toBe("Mercado: llevas $410.000,00 de $500.000,00 (82 %)");
    expect(budgetAlert(crossing("over", 510000.5, 102), "COP")).toBe("Mercado: te pasaste del presupuesto por $10.000,50 ($510.000,50 de $500.000,00)");
  });

  it("en inglés", () => {
    expect(budgetAlert(crossing("near", 410000, 82), "COP", "en")).toBe("Mercado: $410,000.00 of $500,000.00 so far (82%)");
    expect(budgetAlert(crossing("over", 510000, 102), "COP", "en")).toBe("Mercado: $10,000.00 over budget ($510,000.00 of $500,000.00)");
  });
});
