import { describe, expect, it } from "vitest";
import type { ExpenseRow } from "./biggest";
import {
  averagedRange,
  calendarDays,
  calendarHref,
  calendarMonth,
  type DayDescriptionTotal,
  type DayTotal,
  dayTotals,
  halves,
  heatLevels,
  insightPhrase,
  weekdayAverages,
  weekdayInsight,
  weekdayName,
  weekdayOf,
  weekdayPlural,
} from "./daily";
import { reportPeriod } from "./period";

const row = (day: string, description: string, total: number, count = 1): DayDescriptionTotal => ({ day, description, total, count });
const totals = (entries: Record<string, number>) => new Map<string, DayTotal>(Object.entries(entries).map(([day, total]) => [day, { total, count: 1 }]));
let seq = 0;
const expense = (occurredOn: string, description: string, amount: number): ExpenseRow => ({
  id: `id-${seq++}`,
  description,
  amount,
  occurredOn,
  categoryName: null,
  categoryEmoji: null,
});

const october = { year: 2026, month: 10 };
const last12 = reportPeriod(undefined, october);
const year2025 = reportPeriod("2025", october);

describe("dayTotals", () => {
  it("suma lo de cada día (también las escrituras distintas), sin los gastos fijos aunque cambien las tildes", () => {
    const days = dayTotals(
      [
        row("2026-10-05", "Almuerzo", 20000.5, 2),
        row("2026-10-05", "almuerzo ", 10000.25),
        row("2026-10-05", "ADMINISTRACIÓN", 300000),
        row("2026-10-06", "Administracion", 300000),
        row("2026-10-07", "Cine", 30000),
      ],
      [{ description: "Administración" }],
    );
    expect(days).toEqual(
      new Map([
        ["2026-10-05", { total: 30000.75, count: 3 }],
        ["2026-10-07", { total: 30000, count: 1 }],
      ]),
    );
  });
});

describe("heatLevels", () => {
  it("el tono va por el puesto entre los días con gastos: el cuarto más alto, el más oscuro", () => {
    const levelOf = heatLevels([40, 10, 0, 30, 20]);
    expect([0, 10, 15, 20, 30, 40, 99].map(levelOf)).toEqual([0, 1, 1, 2, 3, 4, 4]);
  });

  it("una compra enorme no deja a los demás en el tono más claro", () => {
    const levelOf = heatLevels([10, 10, 20, 2000000]);
    expect([10, 20, 2000000].map(levelOf)).toEqual([2, 3, 4]);
  });

  it("si todos gastaron lo mismo, o hay uno solo, el más oscuro; sin días con gastos, también", () => {
    expect(heatLevels([50, 50])(50)).toBe(4);
    expect(heatLevels([50])(50)).toBe(4);
    expect(heatLevels([0, 0])(50)).toBe(4);
    expect(heatLevels([])(0)).toBe(0);
  });
});

describe("weekdayOf, weekdayName y weekdayPlural", () => {
  it("la semana empieza el lunes", () => {
    expect(["2026-10-05", "2026-10-01", "2026-10-10", "2026-10-04", "2024-02-29"].map(weekdayOf)).toEqual([0, 3, 5, 6, 3]);
    expect([0, 1, 2, 3, 4, 5, 6].map(weekdayName)).toEqual(["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]);
    expect([0, 2, 5, 6].map(weekdayPlural)).toEqual(["los lunes", "los miércoles", "los sábados", "los domingos"]);
  });
});

describe("weekdayAverages", () => {
  it("el promedio de cada día de la semana en el rango, contando los días sin gastos", () => {
    const days = totals({
      "2026-10-05": 100, // lunes
      "2026-10-06": 0.1, // martes
      "2026-10-13": 0.2, // martes
      "2026-10-10": 300, // sábado
      "2026-10-17": 100, // sábado
      "2026-10-19": 999, // lunes, fuera del rango
      "2026-10-04": 999, // domingo, fuera del rango
    });
    // Del lunes 5 al domingo 18: dos de cada día.
    expect(weekdayAverages(days, "2026-10-05", "2026-10-18")).toEqual([50, 0.15, 0, 0, 0, 200, 0]);
  });

  it("el primer y el último día del rango cuentan", () => {
    const days = totals({ "2026-10-12": 40, "2026-10-18": 70 });
    expect(weekdayAverages(days, "2026-10-12", "2026-10-18")).toEqual([40, 0, 0, 0, 0, 0, 70]);
  });

  it("cruza meses y años, y un rango vacío da todo en cero", () => {
    const days = totals({ "2025-12-31": 90, "2026-01-01": 60 });
    expect(weekdayAverages(days, "2025-12-29", "2026-01-04")).toEqual([0, 0, 90, 60, 0, 0, 0]);
    expect(weekdayAverages(days, "2026-01-05", "2026-01-04")).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("weekdayInsight e insightPhrase", () => {
  it("el día de más gasto y cuánto más que el promedio de los otros seis", () => {
    const insight = weekdayInsight([100, 100, 100, 100, 100, 300, 100]);
    expect(insight).toEqual({ weekday: 5, pct: 200 });
    expect(insightPhrase(insight)).toBe("Gastas más los sábados: 200% más que el promedio de los otros días.");
  });

  it("si empatan, el primero de la semana", () => {
    expect(weekdayInsight([200, 0, 0, 50, 0, 200, 0])).toEqual({ weekday: 0, pct: Math.round((200 / (250 / 6) - 1) * 100) });
  });

  it("si los otros no gastaron, sin porcentaje; si todos igual, lo dice; sin gastos, nada", () => {
    expect(insightPhrase(weekdayInsight([0, 0, 0, 0, 0, 0, 80]))).toBe("Gastas más los domingos.");
    expect(insightPhrase(weekdayInsight([10, 10, 10, 10, 10, 10, 10]))).toBe("Gastas parecido todos los días de la semana.");
    expect(weekdayInsight([0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(insightPhrase(null)).toBeNull();
  });
});

describe("halves", () => {
  it("del 1 al 15 y del 16 al fin de mes, de todos los meses", () => {
    expect(halves(totals({ "2026-09-01": 10, "2026-09-15": 20.5, "2026-09-16": 5, "2026-10-31": 7.25, "2026-10-02": 1 }))).toEqual({
      first: 31.5,
      second: 12.25,
    });
    expect(halves(new Map())).toEqual({ first: 0, second: 0 });
  });
});

describe("calendarMonth y calendarHref", () => {
  it("un mes del período; si no (fuera, inválido o sin parámetro), el último", () => {
    expect(calendarMonth("2026-09", last12)).toEqual({ year: 2026, month: 9 });
    expect(calendarMonth("2025-11", last12)).toEqual({ year: 2025, month: 11 });
    for (const param of ["2025-10", "2026-11", "2026-13", "septiembre", ["2026-09"], undefined]) {
      expect(calendarMonth(param, last12)).toEqual(october);
    }
    expect(calendarMonth("2025-03", year2025)).toEqual({ year: 2025, month: 3 });
    expect(calendarMonth(undefined, year2025)).toEqual({ year: 2025, month: 12 });
  });

  it("la dirección, sin los parámetros que valen por defecto", () => {
    expect(calendarHref(last12, october)).toBe("/reportes");
    expect(calendarHref(last12, { year: 2026, month: 9 })).toBe("/reportes?calendario=2026-09");
    expect(calendarHref(year2025, { year: 2025, month: 12 })).toBe("/reportes?periodo=2025");
    expect(calendarHref(year2025, { year: 2025, month: 3 })).toBe("/reportes?periodo=2025&calendario=2025-03");
  });
});

describe("averagedRange", () => {
  it("del comienzo del período (o del primer mes con movimientos, si es después) hasta hoy o el fin del período", () => {
    expect(averagedRange(last12.months, null, "2026-10-19")).toEqual({ from: "2025-11-01", to: "2026-10-19" });
    expect(averagedRange(last12.months, "2026-08", "2026-10-19")).toEqual({ from: "2026-08-01", to: "2026-10-19" });
    expect(averagedRange(last12.months, "2024-01", "2026-10-19")).toEqual({ from: "2025-11-01", to: "2026-10-19" });
    expect(averagedRange(year2025.months, "2025-02", "2026-10-19")).toEqual({ from: "2025-02-01", to: "2025-12-31" });
  });
});

describe("calendarDays", () => {
  it("cada día del mes con su total, su tono, su título y sus egresos; los de después de hoy, futuros", () => {
    const days = totals({ "2026-10-10": 300, "2026-10-12": 100 });
    const expenses = [expense("2026-10-10", "Cine", 200), expense("2026-10-10", "Taxi", 100), expense("2026-10-12", "Café", 100)];
    const calendar = calendarDays(october, days, heatLevels([300, 100]), expenses, "2026-10-12");
    expect(calendar).toHaveLength(31);
    expect(calendar[9]).toEqual({
      date: "2026-10-10",
      day: 10,
      title: "Sábado 10 de oct",
      total: 300,
      count: 1,
      level: 4,
      future: false,
      expenses: expenses.slice(0, 2),
    });
    expect(calendar[0]).toMatchObject({ date: "2026-10-01", title: "Jueves 1 de oct", total: 0, count: 0, level: 0, expenses: [] });
    expect(calendar.filter((day) => !day.future).map((day) => day.day)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("los meses de 28, 29 y 30 días", () => {
    expect(calendarDays({ year: 2026, month: 2 }, new Map(), heatLevels([]), [], "2026-10-19")).toHaveLength(28);
    expect(calendarDays({ year: 2024, month: 2 }, new Map(), heatLevels([]), [], "2026-10-19").at(-1)?.date).toBe("2024-02-29");
    expect(calendarDays({ year: 2026, month: 9 }, new Map(), heatLevels([]), [], "2026-10-19")).toHaveLength(30);
  });
});
