import { describe, expect, it } from "vitest";
import {
  compareMonths,
  currentMonthRange,
  formatLongDate,
  formatMonthLabel,
  formatMonthName,
  formatShortDate,
  formatShortMonth,
  monthOf,
  monthParam,
  monthRange,
  monthRangeUpTo,
  parseMonthParam,
  sameDayIn,
  shiftMonth,
  todayInTimezone,
} from "./dates";

describe("todayInTimezone", () => {
  it("usa la fecha local de Bogotá y no la de UTC", () => {
    // 1 nov 2026 02:00 UTC = 31 oct 2026 21:00 en Bogotá (UTC-5)
    const now = new Date("2026-11-01T02:00:00Z");
    expect(todayInTimezone("America/Bogota", now)).toBe("2026-10-31");
  });
});

describe("currentMonthRange", () => {
  it("asigna al mes correcto los movimientos de la última noche del mes", () => {
    const now = new Date("2026-11-01T02:00:00Z");
    expect(currentMonthRange("America/Bogota", now)).toMatchObject({
      start: "2026-10-01",
      end: "2026-11-01",
    });
  });

  it("cruza de diciembre a enero", () => {
    expect(monthRange(2026, 12)).toMatchObject({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("formatMonthLabel", () => {
  it("muestra el mes en español", () => {
    expect(formatMonthLabel({ year: 2026, month: 10 })).toBe("Octubre de 2026");
  });
});

describe("formatMonthName", () => {
  it("da el mes en minúscula, para usarlo dentro de una frase", () => {
    expect(formatMonthName({ year: 2026, month: 9 })).toBe("septiembre");
    expect(formatMonthName({ year: 2025, month: 12 }, { withYear: true })).toBe("diciembre de 2025");
  });
});

describe("?mes= (monthParam y parseMonthParam)", () => {
  it("escribe el mes con dos dígitos y lo vuelve a leer", () => {
    expect(monthParam({ year: 2026, month: 9 })).toBe("2026-09");
    expect(monthParam({ year: 2026, month: 12 })).toBe("2026-12");
    expect(parseMonthParam("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(parseMonthParam("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(parseMonthParam("2000-01")).toEqual({ year: 2000, month: 1 });
  });

  it.each([
    ["sin el parámetro", undefined],
    ["repetido en la URL", ["2026-09", "2026-08"]],
    ["en una lista, aunque sea de uno", ["2026-09"]],
    ["vacío", ""],
    ["el mes 13", "2026-13"],
    ["el mes 0", "2026-00"],
    ["sin el cero", "2026-9"],
    ["con el día", "2026-09-01"],
    ["con texto alrededor", "x2026-09"],
    ["con texto al final", "2026-09x"],
    ["antes del 2000", "1999-12"],
  ])("ignora un mes inválido: %s", (_case, value) => {
    expect(parseMonthParam(value)).toBeNull();
  });
});

describe("monthOf", () => {
  it("da el mes de una fecha", () => {
    expect(monthOf("2026-09-30")).toEqual({ year: 2026, month: 9 });
  });
});

describe("sameDayIn", () => {
  it("en el mes de hoy, hoy; en otro, el mismo día de ese mes", () => {
    expect(sameDayIn({ year: 2026, month: 10 }, "2026-10-17")).toBe("2026-10-17");
    expect(sameDayIn({ year: 2026, month: 9 }, "2026-10-17")).toBe("2026-09-17");
    expect(sameDayIn({ year: 2025, month: 1 }, "2026-10-05")).toBe("2025-01-05");
  });

  it("si el mes no tiene ese día, el último del mes", () => {
    expect(sameDayIn({ year: 2026, month: 9 }, "2026-10-31")).toBe("2026-09-30");
    expect(sameDayIn({ year: 2026, month: 2 }, "2026-03-30")).toBe("2026-02-28");
    expect(sameDayIn({ year: 2024, month: 2 }, "2024-03-31")).toBe("2024-02-29");
    expect(sameDayIn({ year: 2026, month: 12 }, "2027-01-31")).toBe("2026-12-31");
  });
});

describe("monthRangeUpTo", () => {
  it("el mes hasta el mismo día que hoy, inclusive", () => {
    expect(monthRangeUpTo({ year: 2026, month: 9 }, "2026-10-21")).toEqual({ start: "2026-09-01", end: "2026-09-22", year: 2026, month: 9 });
    expect(monthRangeUpTo({ year: 2026, month: 9 }, "2026-10-01")).toEqual({ start: "2026-09-01", end: "2026-09-02", year: 2026, month: 9 });
  });

  it("si el mes no tiene ese día, el mes entero (también de un año a otro)", () => {
    expect(monthRangeUpTo({ year: 2026, month: 9 }, "2026-10-31")).toEqual(monthRange(2026, 9));
    expect(monthRangeUpTo({ year: 2024, month: 2 }, "2024-03-30")).toEqual(monthRange(2024, 2));
    expect(monthRangeUpTo({ year: 2025, month: 12 }, "2026-01-31")).toEqual(monthRange(2025, 12));
    expect(monthRangeUpTo({ year: 2025, month: 12 }, "2026-01-15").end).toBe("2025-12-16");
  });
});

describe("shiftMonth", () => {
  it("avanza y retrocede meses, cruzando de año", () => {
    expect(shiftMonth({ year: 2026, month: 10 }, -1)).toEqual({ year: 2026, month: 9 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, 0)).toEqual({ year: 2026, month: 3 });
  });
});

describe("compareMonths", () => {
  it("dice cuál mes va primero, aunque sean de años distintos", () => {
    expect(compareMonths({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toBe(-1);
    expect(compareMonths({ year: 2026, month: 1 }, { year: 2025, month: 12 })).toBe(1);
    expect(compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 2 })).toBe(-2);
    expect(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 10 })).toBe(0);
  });
});

describe("formatShortDate", () => {
  it("da el día y el mes corto, sin el punto de la abreviatura", () => {
    expect(formatShortDate("2026-10-13")).toBe("13 de oct.");
    expect(formatShortDate("2026-09-05")).toBe("5 de sept.");
  });

  it("los doce meses, sin depender de cómo abrevie cada motor (Safari diría \"sep.\")", () => {
    const months = Array.from({ length: 12 }, (_, i) => formatShortDate(`2026-${String(i + 1).padStart(2, "0")}-01`));
    expect(months).toEqual([
      "1 de ene.", "1 de feb.", "1 de mar.", "1 de abr.", "1 de may.", "1 de jun.",
      "1 de jul.", "1 de ago.", "1 de sept.", "1 de oct.", "1 de nov.", "1 de dic.",
    ]);
    expect(formatShortDate("2026-12-31")).toBe("31 de dic.");
  });

  it("con el año, si se pide", () => {
    expect(formatShortDate("2025-12-28", { withYear: true })).toBe("28 de dic. de 2025");
    expect(formatShortDate("2025-12-28", { withYear: false })).toBe("28 de dic.");
  });
});

describe("formatShortMonth", () => {
  it("el mes corto, el mismo de las fechas cortas", () => {
    expect(formatShortMonth({ year: 2026, month: 9 })).toBe("sept");
    expect(formatShortMonth({ year: 2025, month: 1 })).toBe("ene");
    expect(formatShortMonth({ year: 2025, month: 12 })).toBe("dic");
  });
});

describe("formatLongDate", () => {
  it("incluye el día de la semana (lo usa el bot para entender 'el lunes')", () => {
    expect(formatLongDate("2026-10-13")).toBe("martes 13 de octubre de 2026");
  });
});

describe("todayInTimezone · otras zonas horarias", () => {
  it("respeta la zona del usuario aunque el servidor esté en otra", () => {
    // 13 oct 2026 20:00 UTC = 14 oct en Tokio y 13 oct en Bogotá.
    const now = new Date("2026-10-13T20:00:00Z");
    expect(todayInTimezone("Asia/Tokyo", now)).toBe("2026-10-14");
    expect(todayInTimezone("America/Bogota", now)).toBe("2026-10-13");
  });
});

describe("fechas en inglés", () => {
  it("el mes: con mayúscula, también dentro de una frase", () => {
    expect(formatMonthLabel({ year: 2026, month: 10 }, "en")).toBe("October 2026");
    expect(formatMonthName({ year: 2026, month: 9 }, { locale: "en" })).toBe("September");
    expect(formatMonthName({ year: 2026, month: 9 }, { withYear: true, locale: "en" })).toBe("September 2026");
    expect(formatMonthName({ year: 2026, month: 9 })).toBe("septiembre");
  });

  it("la fecha corta: el mes primero, y la coma antes del año", () => {
    expect(formatShortDate("2026-10-13", { locale: "en" })).toBe("Oct 13");
    expect(formatShortDate("2026-09-01", { withYear: true, locale: "en" })).toBe("Sep 1, 2026");
    expect(formatShortDate("2026-10-13")).toBe("13 de oct.");
  });

  it("el mes corto de las barras", () => {
    expect(formatShortMonth({ year: 2026, month: 9 }, "en")).toBe("Sep");
    expect(formatShortMonth({ year: 2026, month: 1 }, "en")).toBe("Jan");
    expect(formatShortMonth({ year: 2026, month: 12 }, "en")).toBe("Dec");
    expect(formatShortMonth({ year: 2026, month: 9 })).toBe("sept");
  });

  it("la fecha larga: con su coma después del día de la semana", () => {
    expect(formatLongDate("2026-10-13", "en")).toBe("Tuesday, October 13, 2026");
    expect(formatLongDate("2026-10-13")).toBe("martes 13 de octubre de 2026");
  });
});
