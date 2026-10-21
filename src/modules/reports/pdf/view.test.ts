import { describe, expect, it } from "vitest";
import type { Month } from "@/lib/dates";
import { type SampleMovement, sampleMovements, sampleReport } from "../../../../test/report-sample";
import { PDF_COLORS } from "./colors";
import { axisLabel, chartScale, reportPdfView } from "./view";

// Lo que dice el "Reporte (PDF)": los mismos textos que la página de Reportes, para el período elegido.
// Con un año de movimientos de ejemplo (test/report-sample.ts) que termina el 20 de octubre de 2026.

const current: Month = { year: 2026, month: 10 };
const today = "2026-10-20";

function viewOf(movements: SampleMovement[], { name = "Ana", currency = "COP" } = {}) {
  const { report, period, byDay } = sampleReport(movements, current);
  return reportPdfView({ report, period, byDay, current, today, name, currency });
}

const year = viewOf(sampleMovements(current, today));

const expense = (date: string, description: string, amount: number, category: string | null = "Mercado"): SampleMovement => ({
  date,
  type: "expense",
  description,
  category,
  emoji: "🛒",
  amount,
});
const income = (date: string, amount: number): SampleMovement => ({ date, type: "income", description: "Salario", category: "Salario", emoji: "💼", amount });

describe("chartScale y axisLabel (el eje del gráfico)", () => {
  it.each([
    [6_950_000, 8_000_000, 2_000_000],
    [4_000_000, 4_000_000, 1_000_000],
    [950, 1000, 250],
    [120_000, 150_000, 50_000],
    [1, 1, 0.25],
  ])("con el monto más alto en %d, el tope es %d (de a %d)", (top, max, step) => {
    expect(chartScale(top)).toEqual({ max, step });
  });

  it("sin montos, un eje de 0 a 1 (el gráfico queda vacío, sin dividir por cero)", () => {
    expect(chartScale(0)).toEqual({ max: 1, step: 1 });
  });

  it.each([
    [0, "$0"],
    [500, "$500"],
    [250_000, "$250 mil"],
    [1_500, "$1,5 mil"],
    [2_000_000, "$2 M"],
    [2_500_000, "$2,5 M"],
  ])("%d → %s", (value, label) => {
    expect(axisLabel(value)).toBe(label);
  });
});

describe("reportPdfView", () => {
  it("el encabezado y el pie: el período, la persona, cuándo se generó y la moneda", () => {
    expect(year).toMatchObject({
      range: "De noviembre de 2025 a octubre de 2026",
      name: "Ana",
      generated: "Generado el 20 de octubre de 2026",
      currency: "Montos en pesos colombianos (COP)",
      empty: null,
    });
    expect(viewOf([], { currency: "USD" }).currency).toBe("Montos en USD");
  });

  it("las cinco cifras del período, con sus notas y colores", () => {
    expect(year.stats).toEqual([
      { label: "Ingresos", value: "$60.400.000,00", note: null, tone: "income" },
      { label: "Egresos", value: "$57.272.600,00", note: null, tone: "expense" },
      { label: "Balance del período", value: "$3.127.400,00", note: "Ahorraste el 5\u00a0% de tus ingresos", tone: "default" },
      { label: "Gasto promedio por mes", value: "$4.872.254,55", note: "En 11 meses, sin octubre (va en curso)", tone: "default" },
      { label: "El mes de más gasto", value: "Diciembre de 2025", note: "$6.186.800,00", tone: "default" },
    ]);
  });

  it("si gastó más de lo que ganó, el balance va en naranja y lo dice", () => {
    const view = viewOf([income("2026-09-01", 1000000), expense("2026-09-10", "Mercado", 1500000)]);
    expect(view.stats[2]).toEqual({ label: "Balance del período", value: "−$500.000,00", note: "Gastaste más de lo que ganaste", tone: "expense" });
  });

  it("sin meses completos ni egresos, las cifras que no se pueden calcular van con una raya", () => {
    const view = viewOf([income("2026-10-01", 1000000)]);
    expect(view.stats[3]).toEqual({ label: "Gasto promedio por mes", value: "—", note: "Se calcula cuando termine tu primer mes", tone: "default" });
    expect(view.stats[4]).toEqual({ label: "El mes de más gasto", value: "—", note: "Sin egresos en el período", tone: "default" });
    expect(view.stats[2].note).toBe("Ahorraste el 100\u00a0% de tus ingresos");
  });

  it("el gráfico: un par de barras por mes, el año debajo del primero y de enero, y un eje redondo", () => {
    const { bars, max, ticks } = year.chart;
    expect(bars).toHaveLength(12);
    expect(bars[0]).toEqual({ short: "nov", year: "2025", income: 4650000, expense: 4491800, inProgress: false });
    expect(bars[2]).toMatchObject({ short: "ene", year: "2026" });
    expect(bars.filter((bar) => bar.year !== null)).toHaveLength(2);
    expect(bars[11]).toMatchObject({ short: "oct", year: null, inProgress: true });
    expect(max).toBe(8_000_000);
    expect(ticks.map((tick) => tick.label)).toEqual(["$0", "$2 M", "$4 M", "$6 M", "$8 M"]);
  });

  it("mes a mes, del más reciente al más antiguo, con el mes en curso marcado y los balances negativos", () => {
    expect(year.months).toHaveLength(12);
    expect(year.months[0]).toEqual({
      label: "Octubre de 2026",
      inProgress: true,
      income: "$4.650.000,00",
      expense: "$3.677.800,00",
      balance: "$972.200,00",
      negative: false,
    });
    expect(year.months[1]).toMatchObject({ label: "Septiembre de 2026", inProgress: false, balance: "−$214.800,00", negative: true });
    expect(year.months[11].label).toBe("Noviembre de 2025");
  });

  it("las categorías: su total, su parte, el color de su puesto y cómo le fue frente a su promedio", () => {
    const { intro, rows, empty } = year.categories;
    expect(intro).toBe("Lo que sumó cada una en el período, y cómo te fue en septiembre frente a su promedio de junio a agosto.");
    expect(empty).toBeNull();
    expect(rows[0]).toEqual({
      name: "Vivienda",
      amount: "$24.950.000,00",
      share: "44\u00a0%",
      width: 1,
      color: PDF_COLORS.chart[0],
      change: "↘ En septiembre, 16\u00a0% menos que su promedio",
    });
    expect(rows[2]).toMatchObject({ name: "Restaurantes", color: PDF_COLORS.chart[2], change: "↗ En septiembre, 89\u00a0% más que su promedio" });
    expect(rows.find((row) => row.name === "Servicios")?.change).toBe("= En septiembre, igual que su promedio");
    expect(rows[1].width).toBeCloseTo(18700000 / 24950000);
    // De la octava en adelante, en gris; sin con qué comparar, sin la línea.
    expect(rows.at(-1)).toMatchObject({ name: "Transporte", color: PDF_COLORS.chartRest, change: null });
  });

  it("sin un mes completo con qué comparar, las categorías solo dicen lo que sumaron", () => {
    const view = viewOf([expense("2026-10-02", "Mercado", 100000)]);
    expect(view.categories.intro).toBe("Lo que sumó cada una en el período.");
    expect(view.categories.rows).toEqual([{ name: "Mercado", amount: "$100.000,00", share: "100\u00a0%", width: 1, color: PDF_COLORS.chart[0], change: null }]);
  });

  it("no trae los gastos fijos (tienen su pestaña), aunque los descuenta de los gastos más grandes", () => {
    expect(Object.keys(year)).not.toContain("fixed");
    expect(JSON.stringify(year)).not.toContain("Gastos fijos");
  });

  it("los 10 gastos más grandes sin los fijos: la fecha (con el año si no es este) y la categoría", () => {
    const { rows, empty } = year.biggest;
    expect(empty).toBeNull();
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ description: "Tiquetes a Cartagena", detail: "12 de dic. de 2025 · Entretenimiento", amount: "−$1.240.000,00" });
    expect(rows[1]).toEqual({ description: "Lavadora", detail: "3 de jun. · Vivienda", amount: "−$1.150.000,00" });
    expect(rows.map((row) => row.description)).not.toContain("Arriendo");
    const noCategory = viewOf([expense("2026-10-02", "Taxi", 30000, null)]);
    expect(noCategory.biggest.rows).toEqual([{ description: "Taxi", detail: "2 de oct. · Sin categoría", amount: "−$30.000,00" }]);
  });

  it("qué días gasta más: el promedio de cada día de la semana, la frase y las quincenas", () => {
    const { weekdays, insight, halves, empty } = year.daily;
    expect(empty).toBeNull();
    expect(weekdays.map((day) => day.label)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(weekdays[4]).toEqual({ label: "Viernes", amount: "$125.620,00", width: 1 });
    expect(weekdays[0].width).toBeCloseTo(89137.25 / 125620);
    expect(insight).toBe("Gastas más los viernes: 64\u00a0% más que el promedio de los otros días.");
    expect(halves).toEqual([
      { label: "Del 1 al 15", amount: "$15.433.000,00", share: "52\u00a0% del gasto" },
      { label: "Del 16 a fin de mes", amount: "$14.050.000,00", share: "48\u00a0% del gasto" },
    ]);
  });

  it("si todos los egresos son fijos, los gastos más grandes y los días lo dicen", () => {
    const rent = (month: number) => expense(`2026-0${month}-05`, "Arriendo", 1800000, "Vivienda");
    const view = viewOf([rent(6), rent(7), rent(8), rent(9)]);
    expect(view.biggest).toEqual({ rows: [], empty: "Todos los egresos del período son gastos fijos." });
    expect(view.daily.empty).toBe("Todos los egresos del período son gastos fijos.");
    expect(view.daily.weekdays.every((day) => day.width === 0)).toBe(true);
  });

  it("sin movimientos: el PDF solo dice eso, y cada sección, que no hay egresos", () => {
    const view = viewOf([]);
    expect(view.empty).toBe("Aún no tienes movimientos.");
    expect(view.categories.empty).toBe("Sin egresos en el período.");
    expect(view.biggest.empty).toBe("Sin egresos en el período.");
    expect(view.daily).toMatchObject({ empty: "Sin egresos en el período.", insight: null });
    expect(view.chart.ticks).toEqual([
      { value: 0, label: "$0" },
      { value: 1, label: "$1" },
    ]);
  });

  it("con ingresos y sin egresos, la página dice que no hubo egresos", () => {
    const view = viewOf([income("2026-09-01", 1000000)]);
    expect(view.empty).toBeNull();
    expect(view.biggest.empty).toBe("Sin egresos en el período.");
    expect(view.daily.halves.map((half) => half.share)).toEqual(["0\u00a0% del gasto", "0\u00a0% del gasto"]);
  });
});

describe("reportPdfView · en inglés", () => {
  const { report, period, byDay } = sampleReport(sampleMovements(current, today), current, "en");
  const view = reportPdfView({ report, period, byDay, current, today, name: "Ana", currency: "COP", locale: "en" });

  it("el encabezado, las cifras y los textos fijos de la hoja", () => {
    expect(view.labels.title).toBe("Your finances report");
    expect(view.labels.page(1, 2)).toBe("Page 1 of 2");
    expect(view.labels.language).toBe("en-US");
    expect(view.range).toBe("November 2025 to October 2026");
    expect(view.generated).toBe("Generated on October 20, 2026");
    expect(view.currency).toBe("Amounts in Colombian pesos (COP)");
    expect(view.stats.map((s) => s.label)).toEqual(["Income", "Expenses", "Balance for the period", "Average spending per month", "The month with the most spending"]);
    expect(view.stats[0].value).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  it("el gráfico, la tabla, las categorías y el gasto por día", () => {
    expect(view.chart.bars.at(-1)?.short).toBe("Oct");
    expect(view.chart.ticks.at(-1)?.label).toMatch(/^\$[\d.]+ (M|K)$/);
    expect(view.months[0].label).toBe("October 2026");
    expect(view.categories.intro).toMatch(/^What each one added up to in the period/);
    expect(view.daily.weekdays.map((d) => d.label)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(view.daily.halves.map((h) => h.label)).toEqual(["1st to 15th", "16th to month end"]);
    expect(view.daily.halves[0].share).toMatch(/% of spending$/);
  });

  it("el eje en inglés", () => {
    expect(axisLabel(250_000, "en")).toBe("$250 K");
    expect(axisLabel(2_500_000, "en")).toBe("$2.5 M");
    expect(axisLabel(500, "en")).toBe("$500");
  });

  it("sin movimientos", () => {
    const none = sampleReport([], current, "en");
    expect(reportPdfView({ ...none, current, today, name: "Ana", currency: "COP", locale: "en" }).empty).toBe("You don't have transactions yet.");
  });
});
