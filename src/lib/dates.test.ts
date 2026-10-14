import { describe, expect, it } from "vitest";
import { currentMonthRange, formatMonthLabel, monthRange, todayInTimezone } from "./dates";

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
