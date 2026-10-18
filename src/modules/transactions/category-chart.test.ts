import { describe, expect, it } from "vitest";
import { chartSlices, donutArcs, MAX_SLICES, SMALL_SHARE } from "./category-chart";

const cat = (name: string, total: number) => ({ name, emoji: "•", total });
const names = (slices: ReturnType<typeof chartSlices>) =>
  slices.map((s) => (s.kind === "category" ? s.category.name : `resto:${s.categories.map((c) => c.name).join("+")}`));

describe("chartSlices", () => {
  it("cada categoría con su color, de la más grande a la más chica, con su parte del total", () => {
    const slices = chartSlices([cat("Mercado", 300), cat("Ropa", 500), cat("Taxi", 200)], 1000);
    expect(slices).toEqual([
      { kind: "category", color: 0, category: cat("Ropa", 500), share: 0.5 },
      { kind: "category", color: 1, category: cat("Mercado", 300), share: 0.3 },
      { kind: "category", color: 2, category: cat("Taxi", 200), share: 0.2 },
    ]);
  });

  it("las de menos del 3% van juntas al final (si son dos o más)", () => {
    expect(SMALL_SHARE).toBe(0.03);
    const slices = chartSlices([cat("Ahorro", 9000), cat("Cine", 290), cat("Taxi", 200), cat("Impuestos", 10)], 9500);
    expect(names(slices)).toEqual(["Ahorro", "Cine", "resto:Taxi+Impuestos"]);
    expect(slices[2]).toEqual({
      kind: "rest",
      categories: [cat("Taxi", 200), cat("Impuestos", 10)],
      total: 210,
      share: 210 / 9500,
    });
  });

  it("justo el 3% no es chica", () => {
    // Dos con el 3% justo: si fueran chicas, irían juntas.
    expect(names(chartSlices([cat("A", 94), cat("B", 3), cat("C", 3)], 100))).toEqual(["A", "B", "C"]);
  });

  it('si solo quedaría una junta, va sola con su color (no hay tajada "1 más")', () => {
    const slices = chartSlices([cat("A", 990), cat("B", 10)], 1000);
    expect(slices).toEqual([
      { kind: "category", color: 0, category: cat("A", 990), share: 0.99 },
      { kind: "category", color: 1, category: cat("B", 10), share: 0.01 },
    ]);
  });

  it(`hasta ${MAX_SLICES} con su color; las demás, juntas aunque no sean chicas`, () => {
    expect(MAX_SLICES).toBe(7);
    const ten = Array.from({ length: 10 }, (_, i) => cat(`C${i}`, 100 - i));
    const slices = chartSlices(ten, ten.reduce((sum, c) => sum + c.total, 0));
    expect(slices).toHaveLength(8);
    expect(slices.slice(0, 7).map((s) => (s.kind === "category" ? s.color : null))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(names(slices).at(-1)).toBe("resto:C7+C8+C9");
  });

  it("con 7 con color y una sola más, esa va junta (no hay color para ella)", () => {
    const eight = Array.from({ length: 8 }, (_, i) => cat(`C${i}`, 100 - i));
    const slices = chartSlices(eight, eight.reduce((sum, c) => sum + c.total, 0));
    expect(names(slices).at(-1)).toBe("resto:C7");
  });

  it("las partes suman el total (con centavos, sin restos de float)", () => {
    const slices = chartSlices([cat("A", 0.1), cat("B", 0.2), cat("C", 99.7)], 100);
    const restTotal = slices.find((s) => s.kind === "rest");
    expect(restTotal).toMatchObject({ total: 0.3 });
  });

  it("sin egresos, ninguna tajada", () => {
    expect(chartSlices([], 0)).toEqual([]);
    expect(chartSlices([cat("A", 10)], 0)).toEqual([]);
  });
});

describe("donutArcs", () => {
  it("cada tajada empieza donde terminó la anterior", () => {
    const slices = chartSlices([cat("A", 500), cat("B", 300), cat("C", 200)], 1000);
    expect(donutArcs(slices)).toEqual([
      { start: 0, size: 0.5 },
      { start: 0.5, size: 0.3 },
      { start: 0.8, size: 0.2 },
    ]);
  });
});
