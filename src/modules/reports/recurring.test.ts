import { describe, expect, it } from "vitest";
import { type DescriptionMonthTotal, recurringExpenses, recurringFrom } from "./recurring";

const m = (month: number, year = 2026) => ({ year, month });
const months = (from: number, to: number, year = 2026) => Array.from({ length: to - from + 1 }, (_, i) => m(from + i, year));
const twelve = [...months(11, 12, 2025), ...months(1, 10)];

const row = (month: string, description: string, total: number, extra: Partial<DescriptionMonthTotal> = {}): DescriptionMonthTotal => ({
  month,
  description,
  emoji: "🏠",
  count: 1,
  total,
  latest: `${month}-05`,
  ...extra,
});

/** La misma descripción en esos meses de 2026, con el mismo monto. */
const every = (description: string, total: number, ...monthNumbers: number[]) =>
  monthNumbers.map((n) => row(`2026-${String(n).padStart(2, "0")}`, description, total));

describe("recurringFrom", () => {
  it("el comienzo del período, si tiene al menos la ventana", () => {
    expect(recurringFrom(twelve)).toEqual(m(11, 2025));
    expect(recurringFrom(months(7, 10))).toEqual(m(7));
  });

  it("en un período más corto (un año que recién empieza), los meses de antes que faltan", () => {
    expect(recurringFrom(months(1, 2))).toEqual(m(11, 2025));
  });
});

describe("recurringExpenses", () => {
  it("los que están en 3 de los últimos 4 meses o más, con lo que cuestan al mes", () => {
    const report = recurringExpenses(
      [...every("Arriendo", 1800000, 7, 8, 9, 10), ...every("Netflix", 44900, 7, 9, 10), ...every("Gimnasio", 90000, 9, 10)],
      twelve,
    );
    expect(report.items.map((i) => [i.description, i.amount])).toEqual([
      ["Arriendo", 1800000],
      ["Netflix", 44900],
    ]);
    expect(report.total).toBe(1844900);
  });

  it("los de hace tiempo no cuentan: tienen que estar en los últimos meses", () => {
    const report = recurringExpenses(every("Seguro del carro", 300000, 1, 2, 3, 4, 5, 6, 9, 10), twelve);
    expect(report.items).toEqual([]);
  });

  it("el monto es el del último mes en que apareció, y los meses, en cuántos del período está", () => {
    const report = recurringExpenses(
      [
        ...every("Claro hogar", 120000, 1, 2, 3, 4, 5, 6, 7, 8),
        row("2026-09", "Claro hogar", 125749.5),
        row("2025-11", "Claro hogar", 99000),
        row("2025-10", "Claro hogar", 99000),
      ],
      twelve,
    );
    expect(report.items).toEqual([{ description: "Claro hogar", emoji: "🏠", amount: 125749.5, months: 10 }]);
  });

  it("aunque la base devuelva los meses en otro orden, el monto es el del último", () => {
    const report = recurringExpenses([row("2026-10", "Internet", 99000), row("2026-08", "Internet", 89000), row("2026-09", "Internet", 89000)], twelve);
    expect(report.items[0].amount).toBe(99000);
  });

  it("sin importar mayúsculas, tildes ni espacios: es la misma descripción, escrita como la última vez", () => {
    const report = recurringExpenses(
      [
        row("2026-08", "Administración Cívica", 300000),
        row("2026-09", "administracion civica", 300000),
        row("2026-10", "ADMINISTRACIÓN  CÍVICA ", 315600, { emoji: "💡" }),
      ],
      twelve,
    );
    expect(report.items).toEqual([{ description: "ADMINISTRACIÓN  CÍVICA ", emoji: "💡", amount: 315600, months: 3 }]);
  });

  it("dos escrituras en un mismo mes se juntan (se suman), con la del último movimiento", () => {
    const report = recurringExpenses(
      [
        row("2026-08", "Suscripción", 20000),
        row("2026-09", "Suscripción", 20000),
        row("2026-10", "suscripcion", 20000, { latest: "2026-10-02", emoji: "🎬" }),
        row("2026-10", "Suscripción", 24900, { latest: "2026-10-15", emoji: "🎵" }),
      ],
      twelve,
    );
    expect(report.items).toEqual([{ description: "Suscripción", emoji: "🎵", amount: 44900, months: 3 }]);
  });

  it("si en un mes la más reciente es la que ya estaba, se queda con esa", () => {
    const report = recurringExpenses(
      [
        row("2026-08", "Plan celular", 50000),
        row("2026-09", "Plan celular", 50000),
        row("2026-10", "Plan Celular", 50000, { latest: "2026-10-20" }),
        row("2026-10", "plan celular", 1, { latest: "2026-10-01" }),
      ],
      twelve,
    );
    expect(report.items[0].description).toBe("Plan Celular");
  });

  it(`hasta 2 veces en un mes vale (quincenal); más, es algo de todos los días ("Almuerzo"), no un gasto fijo`, () => {
    const twice = recurringExpenses(
      [...every("Cuota", 100, 8, 9), row("2026-10", "Cuota", 200, { count: 2 })],
      twelve,
    );
    expect(twice.items.map((i) => [i.description, i.amount])).toEqual([["Cuota", 200]]);
    const often = recurringExpenses(
      [...every("Almuerzo", 15000, 8, 9), row("2026-10", "Almuerzo", 45000, { count: 3 })],
      twelve,
    );
    expect(often.items).toEqual([]);
  });

  it("del más caro al más barato; si cuestan lo mismo, por descripción", () => {
    const report = recurringExpenses(
      [...every("Netflix", 44900, 8, 9, 10), ...every("Disney", 44900, 8, 9, 10), ...every("Arriendo", 1800000, 8, 9, 10)],
      twelve,
    );
    expect(report.items.map((i) => i.description)).toEqual(["Arriendo", "Disney", "Netflix"]);
  });

  it("en un año que recién empieza, también mira los meses del anterior", () => {
    const report = recurringExpenses(
      [row("2025-11", "Arriendo", 1800000), row("2025-12", "Arriendo", 1800000), row("2026-01", "Arriendo", 1800000)],
      months(1, 2),
    );
    expect(report.items).toEqual([{ description: "Arriendo", emoji: "🏠", amount: 1800000, months: 1 }]);
  });

  it("sin egresos, nada (y el total en cero)", () => {
    expect(recurringExpenses([], twelve)).toEqual({ items: [], total: 0 });
  });

  it("el total suma en centavos exactos", () => {
    const report = recurringExpenses([...every("A", 0.1, 8, 9, 10), ...every("B", 0.2, 8, 9, 10)], twelve);
    expect(report.total).toBe(0.3);
  });
});
