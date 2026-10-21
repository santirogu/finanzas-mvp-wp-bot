import { describe, expect, it } from "vitest";
import { averagedPhrase, categoryChange, type CategoryMonthTotal, categoryReport } from "./categories";

const m = (month: number, year = 2026) => ({ year, month });
const october = m(10);
const months = (from: number, to: number, year = 2026) => Array.from({ length: to - from + 1 }, (_, i) => m(from + i, year));
const row = (month: string, name: string, total: number, emoji = "•"): CategoryMonthTotal => ({ month, name, emoji, total });
const allActive = new Set(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);

describe("categoryReport", () => {
  it("cada categoría con su total en el período y su parte, de la que más sumó a la que menos", () => {
    const report = categoryReport(
      [row("2026-09", "Mercado", 200), row("2026-10", "Mercado", 100), row("2026-10", "Vivienda", 1200), row("2026-08", "Salud", 500)],
      months(8, 10),
      october,
      allActive,
    );
    expect(report.rows.map((r) => [r.name, r.total, r.share])).toEqual([
      ["Vivienda", 1200, 0.6],
      ["Salud", 500, 0.25],
      ["Mercado", 300, 0.15],
    ]);
    expect(report.total).toBe(2000);
  });

  it("si empatan, por nombre", () => {
    const report = categoryReport([row("2026-10", "Salud", 10), row("2026-10", "Mercado", 10)], [october], october, allActive);
    expect(report.rows.map((r) => r.name)).toEqual(["Mercado", "Salud"]);
  });

  it("los meses de antes del período cuentan para el promedio, no para el total; sin gastos en el período no aparece", () => {
    const report = categoryReport(
      [row("2026-06", "Viajes", 5000), row("2026-07", "Mercado", 100), row("2026-09", "Mercado", 100), row("2026-10", "Mercado", 50)],
      months(9, 10),
      october,
      allActive,
    );
    expect(report.rows.map((r) => [r.name, r.total])).toEqual([["Mercado", 150]]);
    // Septiembre (100) frente al promedio de junio a agosto ((0 + 100 + 0) / 3).
    expect(report.rows[0].change?.text).toBe("En septiembre, 200\u00a0% más que su promedio");
  });

  it("junta las filas de la misma categoría en un mes", () => {
    const report = categoryReport([row("2026-10", "Mercado", 0.1), row("2026-10", "Mercado", 0.2)], [october], october, allActive);
    expect(report.rows[0].total).toBe(0.3);
  });

  it("dos categorías con el mismo nombre y distinto emoji son distintas", () => {
    const report = categoryReport([row("2026-10", "Casa", 10, "🏠"), row("2026-10", "Casa", 20, "🏡")], [october], october, allActive);
    expect(report.rows.map((r) => `${r.emoji} ${r.total}`)).toEqual(["🏡 20", "🏠 10"]);
  });

  it("las siete primeras con su color de la paleta, en orden; las demás, en gris", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row("2026-10", `Categoría ${i}`, 900 - i * 10));
    const report = categoryReport(rows, [october], october, allActive);
    expect(report.rows.map((r) => r.color)).toEqual([0, 1, 2, 3, 4, 5, 6, null, null]);
  });

  describe("la comparación", () => {
    const data = [
      row("2026-06", "Restaurantes", 100),
      row("2026-07", "Restaurantes", 100),
      row("2026-08", "Restaurantes", 100),
      row("2026-09", "Restaurantes", 140),
      row("2026-10", "Restaurantes", 900),
    ];

    it("es del último mes completo frente a los tres anteriores (el actual va en curso)", () => {
      const report = categoryReport(data, months(1, 10), october, allActive);
      expect(report.compared).toEqual(m(9));
      expect(report.averaged).toEqual([m(6), m(7), m(8)]);
      expect(report.rows[0].change).toEqual({ direction: "up", text: "En septiembre, 40\u00a0% más que su promedio" });
    });

    it("en un año pasado, la de diciembre", () => {
      const report = categoryReport(
        [row("2025-09", "Mercado", 200), row("2025-10", "Mercado", 200), row("2025-11", "Mercado", 200), row("2025-12", "Mercado", 150)],
        months(1, 12, 2025),
        october,
        new Set(["2025-09", "2025-10", "2025-11", "2025-12"]),
      );
      expect(report.compared).toEqual(m(12, 2025));
      expect(report.rows[0].change?.text).toBe("En diciembre, 25\u00a0% menos que su promedio");
    });

    it("el promedio usa solo los meses con movimientos (antes de empezar a usar la app no cuenta)", () => {
      const report = categoryReport(data, months(1, 10), october, new Set(["2026-08", "2026-09", "2026-10"]));
      expect(report.averaged).toEqual([m(8)]);
      expect(report.rows[0].change?.text).toBe("En septiembre, 40\u00a0% más que su promedio");
    });

    it("sin meses con movimientos antes del comparado, no hay comparación", () => {
      const report = categoryReport(data, months(1, 10), october, new Set(["2026-09", "2026-10"]));
      expect(report.averaged).toEqual([]);
      expect(report.rows[0].change).toBeNull();
    });

    it("si el período solo tiene el mes en curso, no hay mes que comparar", () => {
      const report = categoryReport(data, [m(1)], m(1), allActive);
      expect(report.compared).toBeNull();
      expect(report.averaged).toEqual([]);
      expect(report.rows).toEqual([]);
      const january = categoryReport([row("2026-01", "Mercado", 50)], [m(1)], m(1), allActive);
      expect(january.compared).toBeNull();
      expect(january.rows[0].change).toBeNull();
    });
  });
});

describe("categoryChange", () => {
  it("más o menos que su promedio, en porcentaje", () => {
    expect(categoryChange(140, 100, "septiembre")).toEqual({ direction: "up", text: "En septiembre, 40\u00a0% más que su promedio" });
    expect(categoryChange(75, 100, "septiembre")).toEqual({ direction: "down", text: "En septiembre, 25\u00a0% menos que su promedio" });
  });

  it("con el punto de los miles", () => {
    expect(categoryChange(1600, 100, "septiembre")?.text).toBe("En septiembre, 1.500\u00a0% más que su promedio");
  });

  it("igual (o casi: menos de medio por ciento)", () => {
    expect(categoryChange(100, 100, "septiembre")).toEqual({ direction: "same", text: "En septiembre, igual que su promedio" });
    expect(categoryChange(100.4, 100, "septiembre")?.direction).toBe("same");
  });

  it("sin gastos antes, es nueva; sin gastos en el mes, lo dice", () => {
    expect(categoryChange(80, 0, "septiembre")).toEqual({ direction: "up", text: "Nueva en septiembre" });
    expect(categoryChange(0, 80, "septiembre")).toEqual({ direction: "down", text: "Sin gastos en septiembre" });
  });

  it("sin gastos ni en el mes ni antes, nada que comparar", () => {
    expect(categoryChange(0, 0, "septiembre")).toBeNull();
  });
});

describe("averagedPhrase", () => {
  it("uno, dos o tres meses", () => {
    expect(averagedPhrase([])).toBe("");
    expect(averagedPhrase([m(8)])).toBe("agosto");
    expect(averagedPhrase([m(6), m(8)])).toBe("junio y agosto");
    expect(averagedPhrase([m(6), m(7), m(8)])).toBe("junio a agosto");
  });
});

describe("las categorías en inglés", () => {
  it("los meses del promedio y la comparación de cada una", () => {
    expect(averagedPhrase([{ year: 2026, month: 8 }], "en")).toBe("August");
    expect(averagedPhrase([{ year: 2026, month: 7 }, { year: 2026, month: 8 }], "en")).toBe("July and August");
    expect(averagedPhrase([{ year: 2026, month: 6 }, { year: 2026, month: 7 }, { year: 2026, month: 8 }], "en")).toBe("June to August");
    expect(categoryChange(140, 100, "September", "en")).toEqual({ direction: "up", text: "In September, 40% more than its average" });
    expect(categoryChange(60, 100, "September", "en")).toEqual({ direction: "down", text: "In September, 40% less than its average" });
    expect(categoryChange(100, 100, "September", "en")?.text).toBe("In September, the same as its average");
    expect(categoryChange(100, 0, "September", "en")?.text).toBe("New in September");
    expect(categoryChange(0, 100, "September", "en")?.text).toBe("No spending in September");
    expect(categoryChange(13500, 100, "September", "en")?.text).toBe("In September, 13,400% more than its average");
  });

  it("el informe arma las comparaciones con el mes en inglés", () => {
    const rows: CategoryMonthTotal[] = [
      { month: "2026-08", name: "Mercado", emoji: "🛒", total: 100 },
      { month: "2026-09", name: "Mercado", emoji: "🛒", total: 150 },
    ];
    const report = categoryReport(rows, [{ year: 2026, month: 9 }, { year: 2026, month: 10 }], { year: 2026, month: 10 }, new Set(["2026-08", "2026-09"]), "en");
    expect(report.rows[0].change?.text).toBe("In September, 50% more than its average");
  });
});
