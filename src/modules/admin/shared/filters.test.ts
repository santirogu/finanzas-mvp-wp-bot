import { describe, expect, it } from "vitest";
import { ADMIN_MAX_ROWS, ADMIN_PAGE_SIZE, ADMIN_TIMEZONE, NOTE_MAX_LENGTH, cleanNote, formatDate, parseSearch } from "./filters";

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
