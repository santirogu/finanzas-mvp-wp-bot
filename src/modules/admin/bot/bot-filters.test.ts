import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOT_PATH,
  CLAUDE_DAYS_WHEN_ALL,
  NO_BOT_FILTERS,
  OUTCOMES,
  OUTCOME_LABELS,
  PROBLEM_OUTCOMES,
  activeBotFilters,
  botHref,
  claudeDays,
  errorLabel,
  formatCount,
  formatSeconds,
  formatShortDay,
  parseBotFilters,
} from "./bot-filters";

const TODAY = "2026-10-12";

describe("parseBotFilters y botHref", () => {
  it("sin parámetros, sin filtros", () => {
    expect(parseBotFilters({})).toEqual(NO_BOT_FILTERS);
    expect(botHref(NO_BOT_FILTERS)).toBe("/admin/bot");
  });

  it("lee la búsqueda y la fecha, y las vuelve a escribir igual", () => {
    const filters = parseBotFilters({ q: "  ana  ", fecha: "personalizado", desde: "2026-10-09", hasta: "2026-10-01" });
    expect(filters).toEqual({ search: "ana", date: "personalizado", from: "2026-10-01", to: "2026-10-09" });
    expect(botHref(filters)).toBe(`${BOT_PATH}?q=ana&fecha=personalizado&desde=2026-10-01&hasta=2026-10-09`);
    expect(parseBotFilters({ fecha: "inventada" }).date).toBe("todo");
  });

  it("cada filtro activo tiene su etiqueta y la URL que lo quita", () => {
    const filters = parseBotFilters({ q: "beto", fecha: "7d" });
    expect(activeBotFilters(filters)).toEqual([
      { label: "“beto”", href: `${BOT_PATH}?fecha=7d` },
      { label: "Últimos 7 días", href: `${BOT_PATH}?q=beto` },
    ]);
    expect(activeBotFilters(NO_BOT_FILTERS)).toEqual([]);
  });
});

describe("claudeDays", () => {
  it("los días del filtro, del más viejo al más nuevo", () => {
    expect(claudeDays(parseBotFilters({ fecha: "hoy" }), TODAY)).toEqual([TODAY]);
    expect(claudeDays(parseBotFilters({ fecha: "7d" }), TODAY)).toEqual([
      "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12",
    ]);
  });

  it("con Todo, los últimos 30 días; un rango enorme, los últimos 90; nunca después de hoy", () => {
    const all = claudeDays(NO_BOT_FILTERS, TODAY);
    expect(all).toHaveLength(CLAUDE_DAYS_WHEN_ALL);
    expect(all.at(-1)).toBe(TODAY);
    const huge = claudeDays(parseBotFilters({ fecha: "personalizado", desde: "2020-01-01", hasta: "2030-01-01" }), TODAY);
    expect(huge).toHaveLength(90);
    expect(huge.at(-1)).toBe(TODAY);
    expect(claudeDays(parseBotFilters({ fecha: "personalizado", desde: "2026-10-01", hasta: "2026-10-03" }), TODAY)).toEqual([
      "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
  });
});

describe("formatSeconds", () => {
  it.each([
    [0.8, "0,8 s"],
    [2, "2,0 s"],
    [9.94, "9,9 s"],
    [10, "10 s"],
    [12.4, "12 s"],
    [119, "119 s"],
    [120, "2 min"],
    [150, "3 min"],
  ])("%d → %s", (seconds, expected) => {
    expect(formatSeconds(seconds)).toBe(expected);
  });
});

describe("formatCount y formatShortDay", () => {
  it("los números con puntos de miles y los días cortos, sin punto", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(18400)).toBe("18.400");
    expect(formatCount(1234567)).toBe("1.234.567");
    expect(formatShortDay("2026-10-12")).toBe("12 oct");
    expect(formatShortDay("2026-01-01")).toBe("1 ene");
  });
});

describe("errorLabel", () => {
  it.each([
    ["not_configured", "Claude no está configurado (falta la API key)", null],
    ["refusal", "Claude no quiso responder", null],
    ["invalid_output", "Claude respondió en un formato que no se pudo leer", null],
    ["api_error: Overloaded", "Error de la API de Claude", "Overloaded"],
    ['api_error: 400 {"message": "x"}', "Error de la API de Claude", '400 {"message": "x"}'],
    ["envío: 400 (#131030) Recipient not allowed", "No se pudo enviar la respuesta por WhatsApp", "400 (#131030) Recipient not allowed"],
    ["api_error: x · envío: 500", "No se pudo enviar la respuesta por WhatsApp", "500"],
    ["PostgresError (23505)", "Error interno de la app", "PostgresError (23505)"],
    ["", "Error sin detalle", null],
  ])("%j", (error, label, detail) => {
    expect(errorLabel(error)).toEqual({ label, detail });
  });
});

describe("resultados", () => {
  it("cada resultado tiene su nombre en español", () => {
    expect(OUTCOMES.every((o) => OUTCOME_LABELS[o].length > 0)).toBe(true);
    expect(new Set(Object.values(OUTCOME_LABELS)).size).toBe(OUTCOMES.length);
  });

  it("se resaltan el tope de Claude, los errores y los que no se procesaron", () => {
    expect(PROBLEM_OUTCOMES).toEqual(["tope_claude", "error", "pendiente"]);
  });
});

// La política de privacidad promete que el admin no ve los mensajes. Las consultas del módulo no
// pueden devolver el texto, la respuesta ni los movimientos de un mensaje: del texto solo se usa la
// marca de "no era texto" (y la prueba de integración comprueba que no sale en los resultados).
describe("privacidad de las consultas del bot", () => {
  const source = readFileSync(path.join(__dirname, "bot-activity.ts"), "utf8").replace(/\/\/.*$/gm, "");

  it("el texto del mensaje solo se usa para reconocer los que no eran texto", () => {
    expect(source.match(/whatsappMessage\.body/g)).toHaveLength(1);
    expect(source).toMatch(/const notText = sql`\$\{whatsappMessage\.body\} ~ '\^\\\\\[\[a-z_\]\+\\\\\]\$'`/);
  });

  it("nunca la respuesta del bot, y de la intención solo el tipo, el motivo y los tokens", () => {
    expect(source).not.toMatch(/whatsappMessage\.reply/);
    const intentUses = [...source.matchAll(/whatsappMessage\.intent\}(->>?'[a-zA-Z]+')/g)].map((m) => m[1]);
    expect(intentUses.length).toBeGreaterThan(0);
    for (const use of intentUses) expect(["->>'kind'", "->>'reason'", "->'usage'"]).toContain(use);
  });
});
