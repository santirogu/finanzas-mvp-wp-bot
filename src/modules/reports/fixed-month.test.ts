import { describe, expect, it } from "vitest";
import { type FixedMonth, fixedMonth, fixedMonthView } from "./fixed-month";
import type { HistoryMonth } from "./history";
import { monthFixed } from "./remaining";
import { paymentSchedules } from "./upcoming";

// El estado del mes de los gastos fijos (Fijos): pagado, falta, atrasado o "ya no aplica", con el mismo calendario
// que los avisos de próximos pagos.

const rent = { key: "arriendo", description: "Arriendo", emoji: "🏠", amount: 1500000 };
const internet = { key: "internet", description: "Internet", emoji: "📶", amount: 95000 };
const phone = { key: "celular", description: "Celular", emoji: "📱", amount: 55000 };
const gym = { key: "gimnasio", description: "Gimnasio", emoji: "🏋️", amount: 120000 };

/** Los egresos de una descripción por mes, como los da la base: lo que sumó y el primer pago. */
const paid = (description: string, total: number, ...dates: string[]): HistoryMonth[] =>
  dates.map((date) => ({ month: date.slice(0, 7), description, total, first: date, last: date }));

const NONE = new Set<string>();

const history = [
  ...paid("Arriendo", 1500000, "2026-08-05", "2026-09-05", "2026-10-04"),
  ...paid("Internet", 95000, "2026-08-25", "2026-09-25"),
  ...paid("celular", 55000, "2026-08-12", "2026-09-12"),
  ...paid("Gimnasio", 120000, "2026-09-20"),
];

describe("paymentSchedules", () => {
  it("cada pago esperado con la fecha del pago que contó para él; sin pagos, el gasto no está", () => {
    const schedules = paymentSchedules([rent, { key: "nada" }], history, "2026-10-21");
    expect(schedules.has("nada")).toBe(false);
    expect(schedules.get("arriendo")).toEqual({
      day: 5,
      approximate: false,
      due: [
        { month: "2026-08", date: "2026-08-05", paidOn: "2026-08-05" },
        { month: "2026-09", date: "2026-09-05", paidOn: "2026-09-05" },
        { month: "2026-10", date: "2026-10-05", paidOn: "2026-10-04" },
        { month: "2026-11", date: "2026-11-05", paidOn: null },
      ],
    });
  });

  it("un pago a fin de mes cuenta para el mes siguiente si se suele pagar el 1", () => {
    const due = paymentSchedules([rent], paid("Arriendo", 1500000, "2026-07-01", "2026-08-01", "2026-09-30"), "2026-10-03").get("arriendo")!.due;
    expect(due.filter((d) => d.month >= "2026-09")).toEqual([
      { month: "2026-09", date: "2026-09-01", paidOn: null },
      { month: "2026-10", date: "2026-10-01", paidOn: "2026-09-30" },
      { month: "2026-11", date: "2026-11-01", paidOn: null },
    ]);
  });
});

describe("fixedMonth", () => {
  it("pagado (con la fecha), falta o atrasado (con el día de siempre), y cuántos y cuánto falta", () => {
    const month = fixedMonth([rent, internet, phone, gym], history, NONE, "2026-10-21");
    expect(Object.fromEntries(month.statuses)).toEqual({
      arriendo: { kind: "paid", paidOn: "2026-10-04" },
      internet: { kind: "pending", date: "2026-10-25", overdue: false, usualDay: 25, approximate: true },
      celular: { kind: "pending", date: "2026-10-12", overdue: true, usualDay: 12, approximate: true },
      gimnasio: { kind: "pending", date: "2026-10-20", overdue: true, usualDay: 20, approximate: true },
    });
    expect(month).toMatchObject({ paid: 1, expected: 4, pendingTotal: 270000 });
  });

  it("lo que falta es lo mismo que resta 'Lo que te queda'", () => {
    const skipped = new Set(["celular 2026-10"]);
    for (const today of ["2026-10-01", "2026-10-21", "2026-10-31"]) {
      const items = [rent, internet, phone, gym];
      const expected = monthFixed(items, history, skipped, today).pending.reduce((sum, p) => sum + p.amount, 0);
      expect(fixedMonth(items, history, skipped, today).pendingTotal).toBe(expected);
    }
  });

  it("'ya no aplica' no cuenta entre los esperados; uno ya pagado sigue pagado aunque se marque", () => {
    const month = fixedMonth([rent, phone], history, new Set(["celular 2026-10", "arriendo 2026-10"]), "2026-10-21");
    expect(Object.fromEntries(month.statuses)).toEqual({ arriendo: { kind: "paid", paidOn: "2026-10-04" }, celular: { kind: "skipped" } });
    expect(month).toMatchObject({ paid: 1, expected: 1, pendingTotal: 0 });
  });

  it("hoy es el día de pago: falta, no está atrasado", () => {
    expect(fixedMonth([internet], history, NONE, "2026-10-25").statuses.get("internet")).toMatchObject({ kind: "pending", overdue: false });
  });

  it("sin pago esperado este mes (empezó a pagarlo después), no tiene estado", () => {
    const month = fixedMonth([gym], paid("Gimnasio", 120000, "2026-11-20"), NONE, "2026-10-05");
    expect(month).toEqual({ statuses: new Map(), paid: 0, expected: 0, pendingTotal: 0 });
  });
});

describe("fixedMonthView", () => {
  const month: FixedMonth = {
    statuses: new Map([
      ["arriendo", { kind: "paid", paidOn: "2026-10-04" }],
      ["prima", { kind: "paid", paidOn: "2025-12-30" }],
      ["internet", { kind: "pending", date: "2026-10-25", overdue: false, usualDay: 25, approximate: true }],
      ["celular", { kind: "pending", date: "2026-10-12", overdue: true, usualDay: 12, approximate: false }],
      ["gimnasio", { kind: "skipped" }],
    ]),
    paid: 2,
    expected: 4,
    pendingTotal: 150000,
  };

  it("en español", () => {
    expect(fixedMonthView(month, "2026-10-21", "COP")).toEqual({
      summary: { paid: "2 de 4 pagados este mes", pending: "Faltan $150.000,00" },
      statuses: {
        arriendo: { text: "Pagado el 4 de oct.", tone: "paid" },
        prima: { text: "Pagado el 30 de dic. de 2025", tone: "paid" },
        internet: { text: "Falta · lo sueles pagar el 25 (aprox.)", tone: "pending" },
        celular: { text: "Atrasado · lo sueles pagar el 12", tone: "overdue" },
        gimnasio: { text: "No aplica este mes", tone: "skipped" },
      },
    });
  });

  it("en inglés", () => {
    expect(fixedMonthView(month, "2026-10-21", "COP", "en")).toEqual({
      summary: { paid: "2 of 4 paid this month", pending: "$150,000.00 to go" },
      statuses: {
        arriendo: { text: "Paid on Oct 4", tone: "paid" },
        prima: { text: "Paid on Dec 30, 2025", tone: "paid" },
        internet: { text: "Not paid yet · you usually pay it on the 25th (approx.)", tone: "pending" },
        celular: { text: "Overdue · you usually pay it on the 12th", tone: "overdue" },
        gimnasio: { text: "Doesn't apply this month", tone: "skipped" },
      },
    });
  });

  it("todos pagados, sin lo que falta; sin pagos este mes, sin resumen", () => {
    const allPaid = { ...month, paid: 4, pendingTotal: 0 };
    expect(fixedMonthView(allPaid, "2026-10-21", "COP").summary).toEqual({ paid: "Todos pagados este mes", pending: null });
    expect(fixedMonthView(allPaid, "2026-10-21", "COP", "en").summary).toEqual({ paid: "All paid this month", pending: null });
    expect(fixedMonthView({ statuses: new Map(), paid: 0, expected: 0, pendingTotal: 0 }, "2026-10-21", "COP")).toEqual({ summary: null, statuses: {} });
  });

  it("una clave como '__proto__' queda como una más", () => {
    const view = fixedMonthView({ statuses: new Map([["__proto__", { kind: "skipped" }]]), paid: 0, expected: 0, pendingTotal: 0 }, "2026-10-21", "COP");
    expect(Object.hasOwn(view.statuses, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(view.statuses)).toBe(Object.prototype);
  });
});
