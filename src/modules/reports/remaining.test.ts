import { describe, expect, it } from "vitest";
import type { HistoryMonth } from "./history";
import { type MonthFixed, monthFixed, monthRemaining, PROJECTION_FROM_DAY, remainingView } from "./remaining";

// "Lo que te queda este mes": los gastos fijos que faltan, lo libre, lo que da por día y la proyección del cierre.

const rent = { key: "arriendo", description: "Arriendo", emoji: "🏠", amount: 1500000 };
const internet = { key: "internet", description: "Internet", emoji: "📶", amount: 95000 };
const phone = { key: "celular", description: "Celular", emoji: "📱", amount: 55000 };

/** Los egresos de una descripción por mes, como los da la base: lo que sumó y el primer pago. */
const paid = (description: string, total: number, ...dates: string[]): HistoryMonth[] =>
  dates.map((date) => ({ month: date.slice(0, 7), description, total, first: date }));

const NONE = new Set<string>();

describe("monthFixed (los gastos fijos de este mes)", () => {
  const history = [
    ...paid("Arriendo", 1500000, "2026-08-05", "2026-09-05", "2026-10-05"),
    ...paid("Internet", 95000, "2026-08-25", "2026-09-25"),
    ...paid("celular", 55000, "2026-08-28", "2026-09-28"),
    ...paid("Mercado", 400000, "2026-10-10"),
  ];

  it("los que faltan este mes, sin importar la anticipación de los avisos, y lo que ya se pagó de los fijos", () => {
    expect(monthFixed([rent, internet, phone], history, NONE, "2026-10-21")).toEqual({
      pending: [
        { description: "Internet", amount: 95000 },
        { description: "Celular", amount: 55000 },
      ],
      paid: 1500000,
      hasFixed: true,
    });
  });

  it("uno atrasado de este mes sigue faltando; los de otros meses y el siguiente, no", () => {
    const late = [...paid("Arriendo", 1500000, "2026-08-05", "2026-09-05")];
    expect(monthFixed([rent], late, NONE, "2026-10-21").pending).toEqual([{ description: "Arriendo", amount: 1500000 }]);
    // El 30 de octubre, el del 5 de noviembre ya entra en la anticipación, pero es de noviembre.
    expect(monthFixed([rent], history, NONE, "2026-10-30").pending).toEqual([]);
  });

  it("los marcados 'ya no aplica' no faltan", () => {
    expect(monthFixed([rent, internet, phone], history, new Set(["internet 2026-10"]), "2026-10-21").pending).toEqual([
      { description: "Celular", amount: 55000 },
    ]);
  });

  it("sin gastos fijos, nada que decir", () => {
    expect(monthFixed([], history, NONE, "2026-10-21")).toEqual({ pending: [], paid: 0, hasFixed: false });
  });
});

const fixed = (pending: MonthFixed["pending"], paidTotal = 0, hasFixed = true): MonthFixed => ({ pending, paid: paidTotal, hasFixed });
const pendingOct = [
  { description: "Internet", amount: 95000 },
  { description: "Celular", amount: 55000 },
  { description: "Tarjeta", amount: 500000 },
];

describe("monthRemaining", () => {
  it("lo libre, lo que da por día contando hoy y el cierre al ritmo del gasto variable", () => {
    // El 21 de octubre: 1.130.000 de gasto variable en 21 días (53.809,52 por día) en los 10 que faltan.
    expect(monthRemaining({ income: 4200000, expense: 2980000 }, fixed(pendingOct, 1850000), "2026-10-21")).toEqual({
      free: 570000,
      perDay: 51800,
      day: 21,
      daysInMonth: 31,
      daysLeft: 11,
      pendingTotal: 650000,
      projection: { expense: 4168100, leftover: 31900 },
    });
  });

  it("si no alcanza, sin lo de por día; la proyección dice cuánto faltaría", () => {
    const r = monthRemaining({ income: 1000000, expense: 900000 }, fixed(pendingOct), "2026-10-21");
    expect(r.free).toBe(-550000);
    expect(r.perDay).toBeNull();
    expect(r.projection?.leftover).toBeLessThan(0);
  });

  it("el último día del mes, todo para hoy; con un mes de 30 días o febrero, sus días", () => {
    expect(monthRemaining({ income: 100000, expense: 0 }, fixed([]), "2026-10-31")).toMatchObject({ daysLeft: 1, perDay: 100000 });
    expect(monthRemaining({ income: 100000, expense: 0 }, fixed([]), "2026-09-15")).toMatchObject({ daysInMonth: 30, daysLeft: 16 });
    expect(monthRemaining({ income: 100000, expense: 0 }, fixed([]), "2028-02-10")).toMatchObject({ daysInMonth: 29, daysLeft: 20 });
  });

  it(`proyecta desde el día ${PROJECTION_FROM_DAY}`, () => {
    const before = `2026-10-0${PROJECTION_FROM_DAY - 1}`;
    const from = `2026-10-0${PROJECTION_FROM_DAY}`;
    expect(monthRemaining({ income: 1000000, expense: 70000 }, fixed([]), before).projection).toBeNull();
    // 70.000 en 7 días: 10.000 por día en 31.
    expect(monthRemaining({ income: 1000000, expense: 70000 }, fixed([]), from).projection).toEqual({ expense: 310000, leftover: 690000 });
  });

  it("un fijo pagado con más de lo que suma el mes no deja el gasto variable negativo", () => {
    expect(monthRemaining({ income: 1000000, expense: 100000 }, fixed([], 150000), "2026-10-10").projection).toEqual({
      expense: 100000,
      leftover: 900000,
    });
  });

  it("lo de por día y la proyección, a la centena (con menos de mil, al peso)", () => {
    expect(monthRemaining({ income: 1000, expense: 0 }, fixed([]), "2026-10-21").perDay).toBe(91);
    expect(monthRemaining({ income: 12345.67, expense: 0 }, fixed([]), "2026-10-31").perDay).toBe(12300);
  });
});

describe("remainingView (los textos de la tarjeta)", () => {
  const totals = { income: 4200000, expense: 2980000 };
  const view = (f: MonthFixed, today = "2026-10-21", t = totals, locale: "es" | "en" = "es") =>
    remainingView(monthRemaining(t, f, today), t, f, today, "COP", locale);
  const nbsp = (s: string) => s.replace(/ /g, " ");

  it("lo libre, por día, el avance del mes, de dónde sale y el cierre", () => {
    const v = view(fixed(pendingOct, 1850000));
    expect(v).toMatchObject({
      title: "Lo que te queda este mes",
      label: "Libres hasta el 31 de octubre",
      free: "$570.000,00",
      negative: false,
      note: "Unos $51.800,00 por día en los 11 días que quedan",
      dayOf: "Día 21 de 31",
      progress: 68,
    });
    expect(nbsp(v.monthShare)).toBe("68 % del mes");
    expect(v.rows).toEqual([
      { label: "Ingresos", amount: "$4.200.000,00", kind: "income" },
      { label: "Egresos", amount: "−$2.980.000,00", kind: "expense" },
      { label: "Fijos que faltan (3)", amount: "−$650.000,00", detail: "Internet, Celular y Tarjeta", kind: "expense" },
      { label: "Te quedan", amount: "$570.000,00", kind: "total" },
    ]);
    expect(v.projection).toBe("A este ritmo cerrarías octubre con $4.168.100,00 en egresos: te sobrarían $31.900,00.");
  });

  it("nombra hasta tres fijos que faltan; si los pagó todos, lo dice; sin fijos, no hay fila", () => {
    const many = [...pendingOct, { description: "Gimnasio", amount: 1 }, { description: "Seguro", amount: 1 }];
    expect(view(fixed(many)).rows[2].detail).toBe("Internet, Celular, Tarjeta y 2 más");
    expect(view(fixed([])).rows[2]).toEqual({ label: "Fijos que faltan", amount: "$0,00", detail: "Ya pagaste todos los de este mes", kind: "expense" });
    expect(view(fixed([], 0, false)).rows.map((row) => row.label)).toEqual(["Ingresos", "Egresos", "Te quedan"]);
  });

  it("si no alcanza, por qué: lo que falta pagar o que ya gastó más de lo que le entró", () => {
    const short = view(fixed(pendingOct), "2026-10-21", { income: 1000000, expense: 900000 });
    expect(short).toMatchObject({ free: "−$550.000,00", negative: true, note: "Lo que te entró este mes no alcanza para lo que falta pagar." });
    expect(short.projection).toMatch(/: te faltarían \$[\d.]+,00\.$/);
    expect(view(fixed([]), "2026-10-21", { income: 100000, expense: 200000 }).note).toBe("Este mes ya gastaste más de lo que te entró.");
  });

  it("el último día del mes, y antes de la primera semana, sin proyección", () => {
    expect(view(fixed([]), "2026-10-31", { income: 100000, expense: 0 }).note).toBe("$100.000,00 para hoy, el último día del mes");
    expect(view(fixed([]), "2026-10-03").projection).toBeNull();
  });

  it("en inglés", () => {
    const v = view(fixed(pendingOct, 1850000), "2026-10-21", totals, "en");
    expect(v).toMatchObject({
      title: "What's left this month",
      label: "Free until October 31",
      note: "About $51,800.00 a day for the 11 days left",
      dayOf: "Day 21 of 31",
      monthShare: "68% of the month",
    });
    expect(v.rows.map((row) => row.label)).toEqual(["Income", "Expenses", "Bills left (3)", "Left"]);
    expect(v.rows[2].detail).toBe("Internet, Celular, and Tarjeta");
    expect(v.projection).toBe("At this pace you'd end October with $4,168,100.00 in expenses: $31,900.00 left over.");
    expect(view(fixed(pendingOct), "2026-10-21", { income: 1000000, expense: 900000 }, "en").projection).toMatch(/ short\.$/);
  });
});
