import { describe, expect, it } from "vitest";
import type { HistoryMonth } from "./history";
import { UPCOMING_DAYS_MAX } from "@/db/schema";
import {
  dateInMonth,
  dateLine,
  daysAheadPhrase,
  daysBetween,
  MAX_DAYS_AHEAD,
  upcomingItems,
  upcomingPayments,
  usualDay,
  whenLabel,
  windowPhrase,
} from "./upcoming";

// Los avisos de próximos pagos: qué día se espera cada gasto fijo y de cuáles avisar hoy.

const rent = { key: "arriendo", description: "Arriendo", emoji: "🏠", amount: 1800000 };
const gym = { key: "gimnasio", description: "Gimnasio", emoji: "💪", amount: 120000 };

/** Los pagos de un gasto como los da la base: el primero de cada mes. */
const paid = (description: string, ...dates: string[]): HistoryMonth[] =>
  dates.map((date) => ({ month: date.slice(0, 7), description, total: 1, first: date }));

const NONE = new Set<string>();
const upcoming = (history: HistoryMonth[], today: string, items = [rent], skipped: ReadonlySet<string> = NONE) =>
  upcomingPayments(items, history, skipped, today).map(({ description, month, date, days, usualDay, approximate }) => ({
    description,
    month,
    date,
    days,
    usualDay,
    approximate,
  }));

describe("usualDay (el día del mes en que se suele pagar)", () => {
  it.each([
    [["2026-07-04", "2026-08-05", "2026-09-06"], 5],
    // Un pago atrasado no mueve la fecha (el promedio daría el 10).
    [["2026-07-05", "2026-08-05", "2026-09-20"], 5],
    // Con dos, el promedio; con uno, ese.
    [["2026-08-04", "2026-09-06"], 5],
    [["2026-09-07"], 7],
    // Alrededor del cambio de mes: el 30, el 31 y el 1 van juntos.
    [["2026-07-30", "2026-08-31", "2026-10-01"], 31],
    [["2026-07-31", "2026-09-01", "2026-10-02"], 1],
  ])("%j → el %d", (dates, day) => {
    expect(usualDay(dates)).toBe(day);
  });
});

describe("dateInMonth", () => {
  it.each([
    ["2026-10", 5, "2026-10-05"],
    // Un mes más corto: su último día.
    ["2026-11", 31, "2026-11-30"],
    ["2026-02", 30, "2026-02-28"],
    ["2028-02", 31, "2028-02-29"],
  ])("%s con el %d → %s", (month, day, date) => {
    expect(dateInMonth(month, day)).toBe(date);
  });
});

describe("daysBetween", () => {
  it("cuenta días de calendario, también al cambiar de mes y de año", () => {
    expect(daysBetween("2026-10-03", "2026-10-05")).toBe(2);
    expect(daysBetween("2026-10-10", "2026-10-05")).toBe(-5);
    expect(daysBetween("2026-12-31", "2027-01-03")).toBe(3);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("upcomingPayments", () => {
  const history = paid("Arriendo", "2026-07-05", "2026-08-04", "2026-09-06");

  it("avisa del pago que toca en los próximos 3 días", () => {
    expect(upcoming(history, "2026-10-03")).toEqual([
      { description: "Arriendo", month: "2026-10", date: "2026-10-05", days: 2, usualDay: 5, approximate: false },
    ]);
    expect(upcoming(history, "2026-10-05")[0].days).toBe(0);
  });

  it("a más de 3 días, todavía no", () => {
    expect(upcoming(history, "2026-10-01")).toEqual([]);
  });

  it("si ya se pagó este mes, no (y el del mes siguiente todavía está lejos)", () => {
    expect(upcoming([...history, ...paid("Arriendo", "2026-10-04")], "2026-10-06")).toEqual([]);
  });

  it("si la fecha pasó sin pago, está atrasado", () => {
    expect(upcoming(history, "2026-10-10")).toEqual([
      { description: "Arriendo", month: "2026-10", date: "2026-10-05", days: -5, usualDay: 5, approximate: false },
    ]);
  });

  it("los atrasados de meses que ya terminaron, hasta 3 meses atrás", () => {
    // Pagado solo en marzo (uno agregado a mano): de abril a junio ya no avisa; de julio a octubre, sí.
    const months = upcoming(paid("Arriendo", "2026-03-05"), "2026-10-20").map((p) => p.month);
    expect(months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("'Este pago ya no aplica' oculta solo ese mes", () => {
    const skipped = new Set(["arriendo 2026-09"]);
    const months = upcoming(paid("Arriendo", "2026-06-05", "2026-07-05"), "2026-10-20", [rent], skipped).map((p) => p.month);
    expect(months).toEqual(["2026-08", "2026-10"]);
  });

  it("con menos de 3 pagos, la fecha es aproximada", () => {
    expect(upcoming(paid("Arriendo", "2026-08-04", "2026-09-06"), "2026-10-04")[0]).toMatchObject({ usualDay: 5, approximate: true });
  });

  it("el día 31, en un mes más corto, es su último día", () => {
    const end = paid("Arriendo", "2026-08-31", "2026-09-30", "2026-10-31");
    expect(upcoming(end, "2026-11-28")).toEqual([
      { description: "Arriendo", month: "2026-11", date: "2026-11-30", days: 2, usualDay: 31, approximate: false },
    ]);
  });

  it("a fin de mes avisa del que toca el 1 del mes siguiente (también del año siguiente)", () => {
    const first = paid("Arriendo", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01");
    expect(upcoming(first, "2026-11-29")).toEqual([]);
    expect(upcoming(first, "2026-12-30")).toEqual([
      { description: "Arriendo", month: "2027-01", date: "2027-01-01", days: 2, usualDay: 1, approximate: false },
    ]);
  });

  it("un pago hecho unos días tarde (ya en el mes siguiente) cuenta para su mes", () => {
    // Se suele pagar el 30; el de septiembre se pagó el 2 de octubre.
    const late = paid("Arriendo", "2026-07-30", "2026-08-30", "2026-10-02");
    expect(upcoming(late, "2026-10-10")).toEqual([]);
  });

  it("el primer pago, a fin de mes, es del mes siguiente si se suele pagar a comienzos", () => {
    // El 25 de septiembre se pagó lo del 5 de octubre: septiembre no queda atrasado.
    expect(upcoming(paid("Arriendo", "2026-09-25", "2026-10-05", "2026-11-05"), "2026-11-20")).toEqual([]);
  });

  it("junta las descripciones escritas distinto y solo mira los gastos fijos", () => {
    const mixed = [...paid("Arriendo", "2026-07-05"), ...paid("arriendo ", "2026-08-05", "2026-09-05"), ...paid("Mercado", "2026-09-01")];
    expect(upcoming(mixed, "2026-10-03")).toEqual([
      { description: "Arriendo", month: "2026-10", date: "2026-10-05", days: 2, usualDay: 5, approximate: false },
    ]);
    // Si en un mes hubo dos, vale el primero.
    expect(upcoming([...paid("Arriendo", "2026-07-20"), ...paid("arriendo", "2026-07-05"), ...history.slice(1)], "2026-10-03")[0].usualDay).toBe(5);
  });

  it("sin pagos (agregado a mano pero sin movimientos), no avisa", () => {
    expect(upcoming([], "2026-10-03")).toEqual([]);
  });

  it("de la fecha más vieja a la más próxima; el mismo día, por nombre", () => {
    const both = [...history, ...paid("Gimnasio", "2026-07-03", "2026-08-03", "2026-09-03")];
    expect(upcoming(both, "2026-10-04", [rent, gym]).map((p) => p.description)).toEqual(["Gimnasio", "Arriendo"]);
    const sameDay = [...history, ...paid("Gimnasio", "2026-07-05", "2026-08-05", "2026-09-05")];
    expect(upcoming(sameDay, "2026-10-04", [rent, gym]).map((p) => p.description)).toEqual(["Arriendo", "Gimnasio"]);
  });

  it("trae el monto y el emoji del gasto", () => {
    expect(upcomingPayments([rent], history, NONE, "2026-10-03")[0]).toMatchObject({ key: "arriendo", emoji: "🏠", amount: 1800000 });
  });
});

describe("whenLabel y dateLine (los textos del aviso)", () => {
  it.each([
    [-2, "Atrasado"],
    [0, "Hoy"],
    [1, "Mañana"],
    [3, "En 3 días"],
  ])("%d días → %s", (days, label) => {
    expect(whenLabel(days)).toBe(label);
  });

  it("la fecha, el día de siempre y si es aproximada; con el año si no es el actual", () => {
    const [payment] = upcomingPayments([rent], paid("Arriendo", "2026-08-04", "2026-09-06"), NONE, "2026-10-04");
    expect(dateLine(payment, "2026-10-04")).toBe("5 de oct · lo sueles pagar el 5 (aprox.)");
    expect(dateLine({ ...payment, approximate: false, date: "2027-01-05" }, "2026-12-30")).toBe("5 de ene de 2027 · lo sueles pagar el 5");
  });
});

describe("upcomingItems (los avisos listos para mostrar)", () => {
  it("con su id, el mes, el monto aproximado en negativo, cuándo y si está atrasado", () => {
    const history = paid("Arriendo", "2026-07-05", "2026-08-04", "2026-09-06");
    expect(upcomingItems(upcomingPayments([rent], history, NONE, "2026-10-10"), "2026-10-10", "COP")).toEqual([
      {
        id: "arriendo 2026-10",
        description: "Arriendo",
        emoji: "🏠",
        month: "2026-10",
        monthName: "octubre",
        amount: "≈ −$1.800.000,00",
        when: "Atrasado",
        dateLine: "5 de oct · lo sueles pagar el 5",
        overdue: true,
        category: "Sin categoría",
        amountInput: "1.800.000,00",
      },
    ]);
    // Con la categoría del último pago, si la trae.
    const [withCategory] = upcomingItems(
      upcomingPayments([rent], history, NONE, "2026-10-10").map((p) => ({ ...p, category: "🏠 Vivienda" })),
      "2026-10-10",
      "COP",
    );
    expect(withCategory.category).toBe("🏠 Vivienda");
  });

  it("un pago del año siguiente lleva el año en el nombre del mes", () => {
    const first = paid("Arriendo", "2026-10-01", "2026-11-01", "2026-12-01");
    const [item] = upcomingItems(upcomingPayments([rent], first, NONE, "2026-12-30"), "2026-12-30", "COP");
    expect(item).toMatchObject({ monthName: "enero de 2027", when: "En 2 días", overdue: false });
  });
});

describe("los días de anticipación (Mi cuenta → Notificaciones)", () => {
  const history = paid("Arriendo", "2026-07-15", "2026-08-15", "2026-09-15");
  const days = (today: string, daysAhead: number) => upcomingPayments([rent], history, NONE, today, daysAhead).map((p) => p.days);

  it("avisa con los días que eligió la persona; con 0, solo el mismo día", () => {
    expect(days("2026-10-08", 3)).toEqual([]);
    expect(days("2026-10-08", 7)).toEqual([7]);
    expect(days("2026-10-14", 0)).toEqual([]);
    expect(days("2026-10-15", 0)).toEqual([0]);
    // Los atrasados, con cualquier anticipación.
    expect(days("2026-10-20", 0)).toEqual([-5]);
  });

  it("con 10 días, a fin de mes alcanza el pago del mes siguiente", () => {
    const fifth = paid("Arriendo", "2026-08-05", "2026-09-05", "2026-10-05");
    expect(upcomingPayments([rent], fifth, NONE, "2026-10-27", 10).map((p) => [p.month, p.days])).toEqual([["2026-11", 9]]);
  });

  it("el máximo es el mismo que acepta la base", () => {
    expect(MAX_DAYS_AHEAD).toBe(UPCOMING_DAYS_MAX);
  });

  it.each([
    [0, "de hoy", "el mismo día"],
    [1, "de hoy y mañana", "1 día antes"],
    [3, "de los próximos 3 días", "3 días antes"],
    [10, "de los próximos 10 días", "10 días antes"],
  ])("con %d: la tarjeta dice %j y el aviso al guardar, %j", (daysAhead, window, ahead) => {
    expect(windowPhrase(daysAhead)).toBe(window);
    expect(daysAheadPhrase(daysAhead)).toBe(ahead);
  });
});
