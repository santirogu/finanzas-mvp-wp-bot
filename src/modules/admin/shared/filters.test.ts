import { describe, expect, it } from "vitest";
import {
  ADMIN_MAX_ROWS,
  ADMIN_PAGE_SIZE,
  ADMIN_TIMEZONE,
  DATE_PRESETS,
  DATE_PRESET_TEXTS,
  NOTE_MAX_LENGTH,
  cleanNote,
  dateFilterLabel,
  formatDate,
  formatDateTime,
  formatHour,
  parseSearch,
  withHourArticle,
} from "./filters";

// Lo común de los listados de administración. El resto (fechas, búsqueda, formatos) se prueba con
// el Historial (src/modules/admin/history/log-filters.test.ts), que lo usa tal cual.

const NULL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const NEWLINE = String.fromCharCode(10);
const DELETE = String.fromCharCode(127);

describe("configuración", () => {
  it("de a 50 filas, hasta 500, en la hora de Colombia", () => {
    expect(ADMIN_PAGE_SIZE).toBe(50);
    expect(ADMIN_MAX_ROWS).toBe(500);
    expect(ADMIN_TIMEZONE).toBe("America/Bogota");
  });
});

describe("parseSearch", () => {
  it("quita los caracteres de control (Postgres rechaza el nulo en un texto)", () => {
    expect(parseSearch({ q: `an${NULL}a` })).toBe("ana");
    expect(parseSearch({ q: `${TAB}ana${NEWLINE}` })).toBe("ana");
    expect(parseSearch({ q: `a${DELETE}na` })).toBe("ana");
    expect(parseSearch({ q: NULL })).toBe("");
  });

  it("deja lo demás tal cual: tildes, eñes, emojis y símbolos", () => {
    expect(parseSearch({ q: " Ñandú 😀 100%_ " })).toBe("Ñandú 😀 100%_");
    expect(parseSearch({ q: "a b" })).toBe("a b");
  });

  it("de máximo 100 caracteres, contando después de limpiar", () => {
    expect(parseSearch({ q: NULL.repeat(50) + "a".repeat(120) })).toBe("a".repeat(100));
  });
});

describe("formatDate", () => {
  it("la fecha en Colombia, sin la hora", () => {
    expect(formatDate(new Date("2026-10-14T21:41:00Z"))).toBe("14 de oct de 2026");
    // 11:30 p. m. del 9 en Colombia, aunque en UTC ya es el 10.
    expect(formatDate(new Date("2026-10-10T04:30:00Z"))).toBe("9 de oct de 2026");
  });
});

describe("cleanNote", () => {
  it("deja la nota en una línea, sin espacios de más ni caracteres de control", () => {
    expect(NOTE_MAX_LENGTH).toBe(300);
    expect(cleanNote("  Usa la cuenta\n\nde otra   persona ")).toBe("Usa la cuenta de otra persona");
    expect(cleanNote(`a${TAB}b${NULL}c${DELETE}d`)).toBe("a bcd");
    expect(cleanNote("Ñandú 😀 100%")).toBe("Ñandú 😀 100%");
    expect(cleanNote("   ")).toBe("");
  });

  it("de máximo 300 caracteres", () => {
    expect(cleanNote("a".repeat(400))).toHaveLength(300);
  });
});

describe("en inglés", () => {
  const night = new Date("2026-10-14T21:41:00Z");

  it("las fechas y horas en Colombia, con el formato de Estados Unidos", () => {
    expect(formatDate(night, "en")).toBe("Oct 14, 2026");
    expect(formatDateTime(night, "en")).toBe("Oct 14, 2026, 4:41 PM");
    expect(formatHour(night, "en")).toBe("4:41 PM");
    expect(formatHour(night)).toBe("4:41 p. m.");
  });

  it.each([
    ["2026-10-14T18:05:00Z", "la 1:05 p. m."],
    ["2026-10-14T06:30:00Z", "la 1:30 a. m."],
    ["2026-10-14T20:15:00Z", "las 3:15 p. m."],
    ["2026-10-14T15:00:00Z", "las 10:00 a. m."],
    ["2026-10-14T16:59:00Z", "las 11:59 a. m."],
    ["2026-10-14T17:00:00Z", "las 12:00 p. m."],
  ])("la hora de las %s con su artículo: “%s” (la 1, las demás)", (iso, expected) => {
    expect(withHourArticle(formatHour(new Date(iso)))).toBe(expected);
  });

  it("los atajos de fecha", () => {
    expect(DATE_PRESETS.map((p) => DATE_PRESET_TEXTS.en[p])).toEqual(["All", "Today", "Last 7 days", "Last 30 days", "Custom"]);
    expect(dateFilterLabel({ date: "7d", from: null, to: null }, "en")).toBe("Last 7 days");
  });

  it.each([
    [{ from: "2026-10-01", to: "2026-10-15" }, "Oct 1 – Oct 15", "1 de oct – 15 de oct"],
    [{ from: "2026-10-01", to: "2026-10-01" }, "Oct 1", "1 de oct"],
    [{ from: "2026-10-01", to: null }, "From Oct 1", "Desde el 1 de oct"],
    [{ from: null, to: "2026-10-15" }, "Until Oct 15", "Hasta el 15 de oct"],
  ])("un rango personalizado %j: %s", (range, en, es) => {
    expect(dateFilterLabel({ date: "personalizado", ...range }, "en")).toBe(en);
    expect(dateFilterLabel({ date: "personalizado", ...range })).toBe(es);
  });
});
