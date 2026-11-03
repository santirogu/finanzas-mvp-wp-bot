import { describe, expect, it } from "vitest";
import { averageNote, type MonthPoint, monthSavedNote, monthSeries, periodSummary, savedNote } from "./summary";

const m = (month: number, year = 2026) => ({ year, month });
const october = m(10);

/** Un mes del período con sus totales. */
const point = (month: number, income: number, expense: number, year = 2026): MonthPoint => ({
  month: m(month, year),
  income,
  expense,
  balance: Math.round((income - expense) * 100) / 100,
});

describe("monthSeries", () => {
  it("todos los meses del período, en orden, con cero los que no tuvieron movimientos", () => {
    const series = monthSeries([m(8), m(9), m(10)], [
      { month: "2026-10", income: 300, expense: 120.5 },
      { month: "2026-08", income: 0, expense: 50 },
    ]);
    expect(series).toEqual([
      { month: m(8), income: 0, expense: 50, balance: -50 },
      { month: m(9), income: 0, expense: 0, balance: 0 },
      { month: m(10), income: 300, expense: 120.5, balance: 179.5 },
    ]);
  });

  it("ignora los meses que no son del período", () => {
    expect(monthSeries([m(10)], [{ month: "2026-09", income: 999, expense: 999 }])).toEqual([
      { month: m(10), income: 0, expense: 0, balance: 0 },
    ]);
  });

  it("el balance, redondeado a centavos (sin restos de float)", () => {
    const [only] = monthSeries([m(10)], [{ month: "2026-10", income: 0.3, expense: 0.1 }]);
    expect(only.balance).toBe(0.2);
  });
});

describe("periodSummary", () => {
  it("suma los ingresos y egresos de todos los meses, en centavos exactos", () => {
    const summary = periodSummary([point(8, 0.1, 0.1), point(9, 0.2, 0.2), point(10, 1000, 500)], october, m(8));
    expect(summary).toMatchObject({ income: 1000.3, expense: 500.3, balance: 500 });
  });

  describe("cuánto ahorró", () => {
    it("qué parte de los ingresos quedó", () => {
      expect(periodSummary([point(10, 1000, 720)], october, m(10)).saved).toBe("28");
    });

    it("con muy poco, \"<1\" (no \"0\", que parecería nada)", () => {
      expect(periodSummary([point(10, 100000, 99999)], october, m(10)).saved).toBe("<1");
    });

    it("si gastó más de lo que ganó, lo dice", () => {
      expect(periodSummary([point(10, 100, 150)], october, m(10)).saved).toBe("overspent");
      expect(periodSummary([point(10, 0, 150)], october, m(10)).saved).toBe("overspent");
    });

    it("con el balance en cero, nada", () => {
      expect(periodSummary([point(10, 100, 100)], october, m(10)).saved).toBeNull();
      expect(periodSummary([point(10, 0, 0)], october, null).saved).toBeNull();
    });
  });

  describe("el gasto promedio por mes", () => {
    it("solo con los meses completos: el actual va en curso", () => {
      const summary = periodSummary([point(8, 0, 300), point(9, 0, 100), point(10, 0, 5)], october, m(8));
      expect(summary.averageExpense).toEqual({ amount: 200, months: 2, withoutCurrent: true });
    });

    it("en un año pasado, todos sus meses (y no dice que falte el actual)", () => {
      const series = Array.from({ length: 12 }, (_, i) => point(i + 1, 0, 120, 2025));
      expect(periodSummary(series, october, m(1, 2024)).averageExpense).toEqual({ amount: 120, months: 12, withoutCurrent: false });
    });

    it("desde el primer mes en que registró algo (antes no usaba la app: bajaría el promedio)", () => {
      const summary = periodSummary([point(6, 0, 0), point(7, 0, 0), point(8, 0, 90), point(9, 0, 0), point(10, 0, 40)], october, m(8));
      expect(summary.averageExpense).toEqual({ amount: 45, months: 2, withoutCurrent: true });
    });

    it("redondeado a centavos", () => {
      const summary = periodSummary([point(7, 0, 100), point(8, 0, 100), point(9, 0, 100.01)], october, m(7));
      expect(summary.averageExpense?.amount).toBe(100);
    });

    it("sin meses completos (recién empezó, o no tiene movimientos), no hay promedio", () => {
      expect(periodSummary([point(9, 0, 0), point(10, 0, 80)], october, m(10)).averageExpense).toBeNull();
      expect(periodSummary([point(9, 0, 0), point(10, 0, 0)], october, null).averageExpense).toBeNull();
    });
  });

  describe("el mes de más gasto", () => {
    it("el de los egresos más altos", () => {
      expect(periodSummary([point(8, 0, 300), point(9, 900, 700), point(10, 0, 100)], october, m(8)).topMonth).toEqual({
        month: m(9),
        expense: 700,
      });
    });

    it("si empatan, el más reciente", () => {
      expect(periodSummary([point(8, 0, 300), point(9, 0, 300), point(10, 0, 100)], october, m(8)).topMonth?.month).toEqual(m(9));
    });

    it("sin egresos, ninguno", () => {
      expect(periodSummary([point(9, 500, 0), point(10, 0, 0)], october, m(9)).topMonth).toBeNull();
    });
  });
});

describe("savedNote y averageNote (las notas de las cifras, en la página y en el PDF)", () => {
  it("cuánto ahorró, o que gastó más de lo que ganó; sin balance, nada", () => {
    expect(savedNote("28")).toBe("Ahorraste el 28\u00a0% de tus ingresos");
    expect(savedNote("overspent")).toBe("Gastaste más de lo que ganaste");
    expect(savedNote(null)).toBeUndefined();
  });

  it("la del Resumen: 'vas ahorrando' con el mes en curso, 'ahorraste' con uno pasado; si no sobró, nada", () => {
    expect(monthSavedNote(4200000, 1220000, true)).toBe("Vas ahorrando el 29\u00a0% de tus ingresos");
    expect(monthSavedNote(4200000, 1220000, false)).toBe("Ahorraste el 29\u00a0% de tus ingresos");
    expect(monthSavedNote(2000000, 2000000, true)).toBe("Vas ahorrando el 100\u00a0% de tus ingresos");
    expect(monthSavedNote(1000, 4, false)).toBe("Ahorraste el <1\u00a0% de tus ingresos");
    expect(monthSavedNote(1000000, 0, true)).toBeUndefined();
    expect(monthSavedNote(0, -50000, false)).toBeUndefined();
    expect(monthSavedNote(4200000, 1220000, true, "en")).toBe("You're saving 29% of your income");
    expect(monthSavedNote(4200000, 1220000, false, "en")).toBe("You saved 29% of your income");
  });

  it("con cuántos meses se calculó el promedio y si dejó fuera el actual", () => {
    expect(averageNote({ amount: 1, months: 3, withoutCurrent: true }, october)).toBe("En 3 meses, sin octubre (va en curso)");
    expect(averageNote({ amount: 1, months: 1, withoutCurrent: false }, october)).toBe("En 1 mes");
    expect(averageNote(null, october)).toBe("Se calcula cuando termine tu primer mes");
  });
});

describe("las notas en inglés", () => {
  it("el balance y el gasto promedio", () => {
    expect(savedNote("28", "en")).toBe("You saved 28% of your income");
    expect(savedNote("overspent", "en")).toBe("You spent more than you earned");
    expect(savedNote(null, "en")).toBeUndefined();
    expect(averageNote(null, { year: 2026, month: 10 }, "en")).toBe("It's calculated when your first month ends");
    expect(averageNote({ amount: 1, months: 3, withoutCurrent: true }, { year: 2026, month: 10 }, "en")).toBe("Over 3 months, without October (in progress)");
    expect(averageNote({ amount: 1, months: 1, withoutCurrent: false }, { year: 2026, month: 10 }, "en")).toBe("Over 1 month");
  });
});
