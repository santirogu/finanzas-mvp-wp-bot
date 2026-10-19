import { describe, expect, it } from "vitest";
import { type DescriptionMonthTotal, type FixedChoices, recurringExpenses, recurringFrom } from "./recurring";

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
    expect(report.items).toEqual([{ key: "claro hogar", description: "Claro hogar", emoji: "🏠", amount: 125749.5, months: 10, origin: "auto" }]);
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
    expect(report.items).toEqual([
      { key: "administracion civica", description: "ADMINISTRACIÓN  CÍVICA ", emoji: "💡", amount: 315600, months: 3, origin: "auto" },
    ]);
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
    expect(report.items).toEqual([{ key: "suscripcion", description: "Suscripción", emoji: "🎵", amount: 44900, months: 3, origin: "auto" }]);
  });

  it("las escrituras que se juntan suman sus veces: 2 y 1 en un mes son 3, y ya no es fijo", () => {
    const report = recurringExpenses(
      [...every("Almuerzo", 15000, 8, 9), row("2026-10", "Almuerzo", 30000, { count: 2 }), row("2026-10", "almuerzo", 15000, { count: 1 })],
      twelve,
    );
    expect(report.items).toEqual([]);
  });

  it("si las dos son del mismo día, se queda con la primera que llegó", () => {
    const report = recurringExpenses(
      [
        ...every("Gimnasio", 90000, 8, 9),
        row("2026-10", "Gimnasio", 45000, { latest: "2026-10-03", emoji: "🏋️" }),
        row("2026-10", "gimnasio", 45000, { latest: "2026-10-03", emoji: "💪" }),
      ],
      twelve,
    );
    expect(report.items[0]).toMatchObject({ description: "Gimnasio", emoji: "🏋️", amount: 90000 });
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
    expect(report.items).toEqual([{ key: "arriendo", description: "Arriendo", emoji: "🏠", amount: 1800000, months: 1, origin: "auto" }]);
  });

  it("sin egresos, nada (y el total en cero)", () => {
    expect(recurringExpenses([], twelve)).toEqual({ items: [], total: 0, removed: [], candidates: [] });
  });

  it("el total suma en centavos exactos", () => {
    const report = recurringExpenses([...every("A", 0.1, 8, 9, 10), ...every("B", 0.2, 8, 9, 10)], twelve);
    expect(report.total).toBe(0.3);
  });
});

describe("recurringExpenses · lo que marca la persona", () => {
  const choices = (include: string[] = [], exclude: string[] = []): FixedChoices => ({ include: new Set(include), exclude: new Set(exclude) });
  const rows = [
    ...every("Arriendo", 1800000, 7, 8, 9, 10),
    ...every("Netflix", 44900, 8, 9, 10),
    row("2026-03", "Seguro del carro", 950000, { emoji: "🛡️" }),
    row("2026-10", "Seguro del carro", 960000, { emoji: "🛡️" }),
    row("2026-10", "Almuerzo", 45000, { count: 3, emoji: "🍽️" }),
    row("2026-09", "Mercado", 600000, { emoji: "🛒" }),
  ];

  it("sin marcas, los detectados son automáticos y los demás egresos del período se pueden agregar", () => {
    const report = recurringExpenses(rows, twelve);
    expect(report.items.map((i) => [i.key, i.origin])).toEqual([
      ["arriendo", "auto"],
      ["netflix", "auto"],
    ]);
    expect(report.candidates).toEqual([
      { key: "almuerzo", description: "Almuerzo", emoji: "🍽️" },
      { key: "mercado", description: "Mercado", emoji: "🛒" },
      { key: "seguro del carro", description: "Seguro del carro", emoji: "🛡️" },
    ]);
    expect(report.removed).toEqual([]);
  });

  it("uno detectado que quitó pasa a quitados (y no suma en el total)", () => {
    const report = recurringExpenses(rows, twelve, choices([], ["netflix"]));
    expect(report.items.map((i) => i.key)).toEqual(["arriendo"]);
    expect(report.removed).toEqual([{ key: "netflix", description: "Netflix", emoji: "🏠" }]);
    expect(report.total).toBe(1800000);
    expect(report.candidates.map((c) => c.key)).not.toContain("netflix");
  });

  it("uno que agregó aparece aunque no se detecte, con el último monto del período y sus meses", () => {
    const report = recurringExpenses(rows, twelve, choices(["seguro del carro"]));
    expect(report.items).toContainEqual({
      key: "seguro del carro",
      description: "Seguro del carro",
      emoji: "🛡️",
      amount: 960000,
      months: 2,
      origin: "manual",
    });
    expect(report.items.map((i) => i.key)).toEqual(["arriendo", "seguro del carro", "netflix"]);
    expect(report.total).toBe(2804900);
    expect(report.candidates.map((c) => c.key)).toEqual(["almuerzo", "mercado"]);
  });

  it("agregar uno que ya se detecta no cambia nada: sigue automático", () => {
    expect(recurringExpenses(rows, twelve, choices(["arriendo"])).items[0]).toMatchObject({ key: "arriendo", origin: "auto" });
  });

  it("quitado y sin detectarse en este período, se puede agregar", () => {
    const year2026 = months(1, 10);
    const report = recurringExpenses([row("2026-02", "Netflix", 44900)], year2026, choices([], ["netflix"]));
    expect(report.removed).toEqual([]);
    expect(report.candidates.map((c) => c.key)).toEqual(["netflix"]);
  });

  it("uno agregado sin egresos en el período no aparece (ni para agregar)", () => {
    const short = months(1, 2);
    const report = recurringExpenses([row("2025-11", "Seguro", 1), row("2025-12", "Otro", 1)], short, choices(["seguro"]));
    expect(report.items).toEqual([]);
    expect(report.candidates).toEqual([]);
  });

  it("los quitados, en orden alfabético", () => {
    const report = recurringExpenses(rows, twelve, choices([], ["netflix", "arriendo"]));
    expect(report.removed.map((r) => r.description)).toEqual(["Arriendo", "Netflix"]);
    expect(report.items).toEqual([]);
  });
});
