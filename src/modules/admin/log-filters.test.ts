import { describe, expect, it } from "vitest";
import {
  ADMIN_LOG_PAGE_SIZE,
  ADMIN_LOG_TIMEZONE,
  EVENT_LABELS,
  EVENT_TYPES,
  escapeLike,
  eventDetail,
  formatEventTime,
  formatPhone,
  hasFilters,
  logHref,
  normalizeSpaces,
  parseLogFilters,
  searchDigits,
} from "./log-filters";

const NONE = { type: null, search: "", from: null, to: null, page: 1 };

describe("configuración", () => {
  it("50 eventos por página, en la hora de Colombia", () => {
    expect(ADMIN_LOG_PAGE_SIZE).toBe(50);
    expect(ADMIN_LOG_TIMEZONE).toBe("America/Bogota");
  });

  it("cada tipo de evento tiene su nombre en español", () => {
    expect(EVENT_TYPES).toEqual([
      "registered",
      "whatsapp_code_created",
      "whatsapp_linked",
      "whatsapp_unlinked",
      "whatsapp_link_failed",
    ]);
    expect(EVENT_LABELS).toEqual({
      registered: "Registro",
      whatsapp_code_created: "Código para vincular",
      whatsapp_linked: "WhatsApp vinculado",
      whatsapp_unlinked: "WhatsApp desvinculado",
      whatsapp_link_failed: "Intento fallido de vinculación",
    });
  });
});

describe("parseLogFilters", () => {
  it("sin parámetros, sin filtros y en la primera página", () => {
    expect(parseLogFilters({})).toEqual(NONE);
  });

  it("lee todos los filtros", () => {
    expect(
      parseLogFilters({ tipo: "whatsapp_linked", q: "  ana@x.co ", desde: "2026-10-01", hasta: "2026-10-14", pagina: "3" }),
    ).toEqual({ type: "whatsapp_linked", search: "ana@x.co", from: "2026-10-01", to: "2026-10-14", page: 3 });
  });

  it.each(["", "otra_cosa", "REGISTERED", "registered ", "__proto__", "constructor"])("ignora el tipo %j", (tipo) => {
    expect(parseLogFilters({ tipo }).type).toBeNull();
  });

  it.each(["0", "-1", "1.5", "abc", "", "1e3", " 2"])("con la página %j vuelve a la primera", (pagina) => {
    expect(parseLogFilters({ pagina }).page).toBe(pagina === "1e3" ? 1000 : pagina === " 2" ? 2 : 1);
  });

  it.each(["2026-02-31", "2026-13-01", "2026-1-5", "2026-10", "2026", "ayer", "2026-10-14T00:00", "'; drop table user; --", ""])(
    "ignora la fecha inválida %j",
    (desde) => {
      expect(parseLogFilters({ desde, hasta: desde })).toMatchObject({ from: null, to: null });
    },
  );

  it("acepta el 29 de febrero solo en años bisiestos", () => {
    expect(parseLogFilters({ desde: "2028-02-29" }).from).toBe("2028-02-29");
    expect(parseLogFilters({ desde: "2026-02-29" }).from).toBeNull();
  });

  it("si las fechas vienen al revés, las ordena", () => {
    expect(parseLogFilters({ desde: "2026-10-14", hasta: "2026-10-01" })).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-14",
    });
    expect(parseLogFilters({ desde: "2026-10-14" })).toMatchObject({ from: "2026-10-14", to: null });
    expect(parseLogFilters({ hasta: "2026-10-01" })).toMatchObject({ from: null, to: "2026-10-01" });
  });

  it("recorta la búsqueda a 100 caracteres", () => {
    expect(parseLogFilters({ q: "a".repeat(500) }).search).toHaveLength(100);
  });

  it("si un parámetro viene repetido, usa el primero", () => {
    expect(parseLogFilters({ tipo: ["registered", "whatsapp_linked"], q: ["ana", "beto"], pagina: ["2", "9"] })).toMatchObject({
      type: "registered",
      search: "ana",
      page: 2,
    });
  });
});

describe("logHref", () => {
  it("sin filtros es /admin", () => {
    expect(logHref(NONE)).toBe("/admin");
    expect(logHref(NONE, 1)).toBe("/admin");
  });

  it("lleva los filtros y la página, con la búsqueda codificada", () => {
    const filters = { type: "whatsapp_unlinked" as const, search: "ana & beto", from: "2026-10-01", to: "2026-10-14", page: 2 };
    expect(logHref(filters)).toBe("/admin?tipo=whatsapp_unlinked&q=ana+%26+beto&desde=2026-10-01&hasta=2026-10-14&pagina=2");
    expect(logHref(filters, 3)).toContain("pagina=3");
    expect(logHref(filters, 1)).not.toContain("pagina");
  });

  it("lo que arma, parseLogFilters lo lee igual", () => {
    const filters = { type: "registered" as const, search: "José %_", from: "2026-01-01", to: "2026-12-31", page: 4 };
    const params = Object.fromEntries(new URL(logHref(filters), "https://x.test").searchParams);
    expect(parseLogFilters(params)).toEqual(filters);
  });
});

describe("hasFilters", () => {
  it("la página sola no cuenta como filtro", () => {
    expect(hasFilters({ ...NONE, page: 5 })).toBe(false);
    expect(hasFilters({ ...NONE, type: "registered" })).toBe(true);
    expect(hasFilters({ ...NONE, search: "a" })).toBe(true);
    expect(hasFilters({ ...NONE, from: "2026-10-01" })).toBe(true);
    expect(hasFilters({ ...NONE, to: "2026-10-01" })).toBe(true);
  });
});

describe("búsqueda", () => {
  it("escapeLike: % y _ del texto no son comodines", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("ana@x.co")).toBe("ana@x.co");
  });

  it("searchDigits: los dígitos de lo que se escribió", () => {
    expect(searchDigits("+57 300-111 2233")).toBe("573001112233");
    expect(searchDigits("ana")).toBe("");
  });
});

describe("formatos", () => {
  it.each([
    ["573001112233", "+57 300 111 2233"],
    ["+57 300 111 2233", "+57 300 111 2233"],
    ["5491122334455", "+5491122334455"],
    // 12 dígitos pero no de Colombia: sin el formato de +57.
    ["549112233445", "+549112233445"],
    ["57300", "+57300"],
  ])("formatPhone(%j) = %j (completo)", (phone, expected) => {
    expect(formatPhone(phone)).toBe(expected);
  });

  it("normalizeSpaces: cambia los espacios duros por normales", () => {
    expect(normalizeSpaces("9:41\u202fp.\u00a0m.")).toBe("9:41 p. m.");
    expect(normalizeSpaces("sin cambios")).toBe("sin cambios");
  });

  it("formatEventTime: en la hora de Colombia y con espacios normales", () => {
    // 02:41 UTC del 15 de octubre = 9:41 p. m. del 14 en Bogotá.
    const text = formatEventTime(new Date("2026-10-15T02:41:00Z"));
    expect(text).toBe("14 de oct de 2026, 9:41 p. m.");
    expect(text).not.toMatch(/[  ]/);
  });

  it.each([
    [{}, ""],
    [{ reason: "by_user" as const }, "lo desvinculó la persona"],
    [{ reason: "number_moved" as const }, "el número pasó a otra cuenta"],
    [{ reason: "number_changed" as const }, "la cuenta vinculó otro número"],
    [{ reason: "invalid_code" as const }, "código inválido o vencido"],
    [{ reason: "rate_limited" as const }, "demasiados intentos"],
    [{ reconstructed: true }, "reconstruido de datos anteriores"],
    [{ reason: "invalid_code" as const, reconstructed: true }, "código inválido o vencido · reconstruido de datos anteriores"],
    [{ reason: "otro" as never }, ""],
    [{ reason: "otro" as never, reconstructed: true }, "reconstruido de datos anteriores"],
  ])("eventDetail(%j) = %j", (details, expected) => {
    expect(eventDetail(details)).toBe(expected);
  });
});
