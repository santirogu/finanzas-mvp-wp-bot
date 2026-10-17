import { describe, expect, it } from "vitest";
import {
  ADMIN_ACTIONS_FILTER,
  ADMIN_EVENT_TYPES,
  EVENT_FILTERS,
  HISTORY_PATH,
  isAdminAction,
  ADMIN_LOG_MAX,
  ADMIN_LOG_PAGE_SIZE,
  ADMIN_LOG_TIMEZONE,
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_FILTER_LABELS,
  NO_FILTERS,
  activeFilterCount,
  addDays,
  dateFilterLabel,
  dateRange,
  dayInBogota,
  dayLabel,
  escapeLike,
  eventDetail,
  formatEventHour,
  formatEventTime,
  formatPhone,
  groupByDay,
  logHref,
  normalizeSpaces,
  parseLogFilters,
  searchDigits,
  showMore,
  withoutFilter,
  type LogFilters,
} from "./log-filters";

const f = (overrides: Partial<LogFilters> = {}): LogFilters => ({ ...NO_FILTERS, ...overrides });
// Espacios duros que usan algunas versiones de ICU (escritos así para que se vean en el código).
const NARROW_NBSP = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);

describe("configuración", () => {
  it("el historial vive en /admin/historial", () => {
    expect(HISTORY_PATH).toBe("/admin/historial");
  });

  it("de a 50 eventos, hasta 500, en la hora de Colombia", () => {
    expect(ADMIN_LOG_PAGE_SIZE).toBe(50);
    expect(ADMIN_LOG_MAX).toBe(500);
    expect(ADMIN_LOG_TIMEZONE).toBe("America/Bogota");
    expect(NO_FILTERS).toEqual({ types: [], date: "todo", from: null, to: null, search: "", limit: 50 });
  });

  it("los filtros tienen sus nombres en español, en el orden de la maqueta", () => {
    expect(EVENT_TYPES.map((t) => EVENT_TYPE_FILTER_LABELS[t])).toEqual([
      "Registros",
      "Códigos",
      "Vinculaciones",
      "Desvinculaciones",
      "Intentos fallidos",
    ]);
    // Y al final, el chip de lo que hizo el admin.
    expect(EVENT_FILTERS).toEqual([...EVENT_TYPES, "admin"]);
    expect(ADMIN_ACTIONS_FILTER).toBe("admin");
    expect(EVENT_TYPE_FILTER_LABELS.admin).toBe("Acciones del admin");
    expect(ADMIN_EVENT_TYPES).toEqual([
      "login_unlocked",
      "sessions_revoked",
      "account_suspended",
      "account_reactivated",
      "account_deleted",
      "bot_claude_paused",
      "bot_claude_resumed",
      "bot_limits_changed",
      "bot_monthly_limit_changed",
      "bot_replies_resent",
    ]);
    expect(DATE_PRESETS.map((p) => DATE_PRESET_LABELS[p])).toEqual([
      "Todo",
      "Hoy",
      "Últimos 7 días",
      "Últimos 30 días",
      "Personalizado",
    ]);
  });
});

describe("parseLogFilters", () => {
  it("sin parámetros: todos los tipos, todas las fechas, los primeros 50", () => {
    expect(parseLogFilters({})).toEqual(NO_FILTERS);
  });

  it("acepta varios tipos, sin repetir y en el orden de siempre", () => {
    expect(parseLogFilters({ tipo: ["whatsapp_link_failed", "registered", "registered"] }).types).toEqual([
      "registered",
      "whatsapp_link_failed",
    ]);
    expect(parseLogFilters({ tipo: "whatsapp_linked" }).types).toEqual(["whatsapp_linked"]);
  });

  it("'admin' (las acciones del admin) se combina con los tipos, al final", () => {
    expect(parseLogFilters({ tipo: "admin" }).types).toEqual(["admin"]);
    expect(parseLogFilters({ tipo: ["admin", "registered"] }).types).toEqual(["registered", "admin"]);
    // Los tipos propios del admin no tienen chip: se ven con "admin".
    expect(parseLogFilters({ tipo: ["login_unlocked", "account_deleted"] }).types).toEqual([]);
  });

  it.each([["otra_cosa"], ["REGISTERED"], ["__proto__"], ["constructor"], [""], ["ADMIN"]])("ignora el tipo %j", (tipo) => {
    expect(parseLogFilters({ tipo: [tipo, "whatsapp_linked"] }).types).toEqual(["whatsapp_linked"]);
  });

  it.each(DATE_PRESETS.filter((p) => p !== "personalizado"))("lee la fecha %s", (fecha) => {
    expect(parseLogFilters({ fecha }).date).toBe(fecha);
  });

  it.each(["ayer", "7D", "", "custom"])("con la fecha %j vuelve a 'todo'", (fecha) => {
    expect(parseLogFilters({ fecha }).date).toBe("todo");
  });

  it("el rango personalizado solo cuenta con fecha=personalizado", () => {
    expect(parseLogFilters({ fecha: "personalizado", desde: "2026-10-01", hasta: "2026-10-14" })).toMatchObject({
      date: "personalizado",
      from: "2026-10-01",
      to: "2026-10-14",
    });
    expect(parseLogFilters({ fecha: "7d", desde: "2026-10-01", hasta: "2026-10-14" })).toMatchObject({
      date: "7d",
      from: null,
      to: null,
    });
    expect(parseLogFilters({ desde: "2026-10-01" })).toMatchObject({ date: "todo", from: null });
  });

  it("el rango personalizado se ordena si viene al revés, y puede tener un solo extremo", () => {
    expect(parseLogFilters({ fecha: "personalizado", desde: "2026-10-14", hasta: "2026-10-01" })).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-14",
    });
    expect(parseLogFilters({ fecha: "personalizado", desde: "2026-10-14" })).toMatchObject({
      from: "2026-10-14",
      to: null,
    });
    expect(parseLogFilters({ fecha: "personalizado", hasta: "2026-10-01" })).toMatchObject({
      from: null,
      to: "2026-10-01",
    });
  });

  it.each(["2026-02-31", "2026-13-01", "2026-1-5", "2026-10", "2026", "ayer", "2026-10-14T00:00", "'; drop table user; --", ""])(
    "ignora el día inválido %j (sin fechas válidas, el personalizado es 'todo')",
    (day) => {
      expect(parseLogFilters({ fecha: "personalizado", desde: day, hasta: day })).toMatchObject({
        date: "todo",
        from: null,
        to: null,
      });
    },
  );

  it("acepta el 29 de febrero solo en años bisiestos", () => {
    expect(parseLogFilters({ fecha: "personalizado", desde: "2028-02-29" }).from).toBe("2028-02-29");
    expect(parseLogFilters({ fecha: "personalizado", desde: "2026-02-29" }).from).toBeNull();
  });

  it.each([
    ["100", 100],
    ["150", 150],
    ["120", 150],
    ["1", 50],
    ["0", 50],
    ["-50", 50],
    ["500", 500],
    ["9999", 500],
    ["1.5", 50],
    ["abc", 50],
    ["", 50],
  ])("mostrar=%j muestra %i eventos", (mostrar, limit) => {
    expect(parseLogFilters({ mostrar }).limit).toBe(limit);
  });

  it("recorta la búsqueda a 100 caracteres y quita espacios de los extremos", () => {
    expect(parseLogFilters({ q: "a".repeat(500) }).search).toHaveLength(100);
    expect(parseLogFilters({ q: "  ana  " }).search).toBe("ana");
  });

  it("si un parámetro de un solo valor viene repetido, usa el primero", () => {
    expect(parseLogFilters({ q: ["ana", "beto"], fecha: ["hoy", "7d"], mostrar: ["100", "500"] })).toMatchObject({
      search: "ana",
      date: "hoy",
      limit: 100,
    });
  });
});

describe("logHref", () => {
  it("sin filtros es /admin/historial", () => {
    expect(logHref(NO_FILTERS)).toBe("/admin/historial");
  });

  it("repite tipo por cada tipo y omite lo que está por defecto", () => {
    expect(logHref(f({ types: ["registered", "whatsapp_linked"], date: "7d", search: "ana & beto", limit: 100 }))).toBe(
      "/admin/historial?tipo=registered&tipo=whatsapp_linked&fecha=7d&q=ana+%26+beto&mostrar=100",
    );
  });

  it("las fechas del rango solo van con 'personalizado'", () => {
    expect(logHref(f({ date: "personalizado", from: "2026-10-01", to: "2026-10-14" }))).toBe(
      "/admin/historial?fecha=personalizado&desde=2026-10-01&hasta=2026-10-14",
    );
    expect(logHref(f({ date: "personalizado", from: "2026-10-01" }))).toBe("/admin/historial?fecha=personalizado&desde=2026-10-01");
    expect(logHref(f({ date: "personalizado", to: "2026-10-01" }))).toBe("/admin/historial?fecha=personalizado&hasta=2026-10-01");
    expect(logHref(f({ date: "hoy", from: "2026-10-01", to: "2026-10-14" }))).toBe("/admin/historial?fecha=hoy");
  });

  it("lo que arma, parseLogFilters lo lee igual", () => {
    const filters = f({
      types: ["whatsapp_code_created", "whatsapp_link_failed"],
      date: "personalizado",
      from: "2026-01-01",
      to: "2026-12-31",
      search: "José %_",
      limit: 200,
    });
    const url = new URL(logHref(filters), "https://x.test");
    const params: Record<string, string[]> = {};
    for (const [key, value] of url.searchParams) (params[key] ??= []).push(value);
    expect(parseLogFilters(params)).toEqual(filters);
  });
});

describe("filtros activos", () => {
  it("activeFilterCount: cada tipo, la fecha y la búsqueda cuentan uno", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount(f({ limit: 300 }))).toBe(0);
    expect(activeFilterCount(f({ types: ["registered", "whatsapp_linked"] }))).toBe(2);
    expect(activeFilterCount(f({ date: "hoy" }))).toBe(1);
    expect(activeFilterCount(f({ search: "ana" }))).toBe(1);
    expect(activeFilterCount(f({ types: ["registered"], date: "30d", search: "ana" }))).toBe(3);
  });

  it("withoutFilter quita solo ese filtro y vuelve a los primeros 50", () => {
    const all = f({
      types: ["registered", "whatsapp_linked"],
      date: "personalizado",
      from: "2026-10-01",
      to: "2026-10-02",
      search: "ana",
      limit: 300,
    });
    expect(withoutFilter(all, { type: "registered" })).toEqual({ ...all, types: ["whatsapp_linked"], limit: 50 });
    expect(withoutFilter(all, "date")).toEqual({ ...all, date: "todo", from: null, to: null, limit: 50 });
    expect(withoutFilter(all, "search")).toEqual({ ...all, search: "", limit: 50 });
  });

  it("showMore suma 50 hasta el tope", () => {
    expect(showMore(f()).limit).toBe(100);
    expect(showMore(f({ limit: 450 })).limit).toBe(500);
    expect(showMore(f({ limit: 500 })).limit).toBe(500);
    expect(showMore(f({ types: ["registered"], search: "x" }))).toMatchObject({ types: ["registered"], search: "x" });
  });
});

describe("fechas", () => {
  it("addDays cruza meses y años", () => {
    expect(addDays("2026-10-15", -1)).toBe("2026-10-14");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it.each([
    ["todo", { from: null, to: null }],
    ["hoy", { from: "2026-10-15", to: "2026-10-15" }],
    ["7d", { from: "2026-10-09", to: "2026-10-15" }],
    ["30d", { from: "2026-09-16", to: "2026-10-15" }],
  ] as const)("dateRange(%s) desde el 15 de octubre", (date, expected) => {
    expect(dateRange(f({ date }), "2026-10-15")).toEqual(expected);
  });

  it("dateRange personalizado usa el rango tal cual", () => {
    expect(dateRange(f({ date: "personalizado", from: "2026-01-01", to: null }), "2026-10-15")).toEqual({
      from: "2026-01-01",
      to: null,
    });
  });

  it.each([
    [f(), "Todo"],
    [f({ date: "hoy" }), "Hoy"],
    [f({ date: "7d" }), "Últimos 7 días"],
    [f({ date: "30d" }), "Últimos 30 días"],
    [f({ date: "personalizado", from: "2026-10-01", to: "2026-10-15" }), "1 de oct – 15 de oct"],
    [f({ date: "personalizado", from: "2026-10-05", to: "2026-10-05" }), "5 de oct"],
    [f({ date: "personalizado", from: "2026-10-05", to: null }), "Desde el 5 de oct"],
    [f({ date: "personalizado", from: null, to: "2026-10-05" }), "Hasta el 5 de oct"],
  ])("dateFilterLabel(%j) = %j", (filters, expected) => {
    expect(dateFilterLabel(filters)).toBe(expected);
  });

  it("dayInBogota: el día en Colombia (a las 9 p. m. del 14 ya es 15 en UTC)", () => {
    expect(dayInBogota(new Date("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
    expect(dayInBogota(new Date("2026-10-15T05:00:00Z"))).toBe("2026-10-15");
  });

  it.each([
    ["2026-10-15", "Hoy"],
    ["2026-10-14", "Ayer"],
    ["2026-10-10", "10 de octubre"],
    ["2026-01-01", "1 de enero"],
    ["2025-09-25", "25 de septiembre de 2025"],
  ])("dayLabel(%s) desde el 15 de octubre = %j", (day, expected) => {
    expect(dayLabel(day, "2026-10-15")).toBe(expected);
  });

  it("groupByDay agrupa por día en Colombia, en orden, sin mezclar", () => {
    const at = (iso: string) => ({ createdAt: new Date(iso), id: iso });
    const entries = [
      at("2026-10-15T20:00:00Z"),
      at("2026-10-15T06:00:00Z"),
      at("2026-10-15T03:00:00Z"), // 14 a las 10 p. m.
      at("2026-10-10T12:00:00Z"),
    ];
    expect(groupByDay(entries, "2026-10-15").map((g) => [g.day, g.label, g.entries.map((e) => e.id)])).toEqual([
      ["2026-10-15", "Hoy", ["2026-10-15T20:00:00Z", "2026-10-15T06:00:00Z"]],
      ["2026-10-14", "Ayer", ["2026-10-15T03:00:00Z"]],
      ["2026-10-10", "10 de octubre", ["2026-10-10T12:00:00Z"]],
    ]);
    expect(groupByDay([], "2026-10-15")).toEqual([]);
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
    expect(normalizeSpaces(`9:41${NARROW_NBSP}p.${NBSP}m.`)).toBe("9:41 p. m.");
    expect(normalizeSpaces("sin cambios")).toBe("sin cambios");
  });

  it("formatEventTime y formatEventHour: en la hora de Colombia", () => {
    // 02:41 UTC del 15 de octubre = 9:41 p. m. del 14 en Bogotá.
    expect(formatEventTime(new Date("2026-10-15T02:41:00Z"))).toBe("14 de oct de 2026, 9:41 p. m.");
    expect(formatEventHour(new Date("2026-10-15T02:41:00Z"))).toBe("9:41 p. m.");
    expect(formatEventHour(new Date("2026-10-15T14:05:00Z"))).toBe("9:05 a. m.");
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
    [{ reason: "constructor" as never }, ""],
    // La frase ya dice que fue el admin.
    [{ reason: "by_admin" as const }, ""],
    [{ sessions: 1 }, "1 sesión"],
    [{ sessions: 3 }, "3 sesiones"],
    [{ sessions: 0 }, ""],
    [{ reason: "by_user" as const, sessions: 2, reconstructed: true }, "lo desvinculó la persona · 2 sesiones · reconstruido de datos anteriores"],
    [{ note: "Usa la cuenta de otra persona" }, "motivo: Usa la cuenta de otra persona"],
    [{ note: "Spam", sessions: 1 }, "motivo: Spam · 1 sesión"],
    [{ note: "" }, ""],
    // Los topes de Claude que cambió el admin en /admin/bot.
    [
      { limits: { perHour: 30, perDay: 1500 }, previousLimits: { perHour: 20, perDay: 100 } },
      "ahora 30 por hora y 1.500 por día (antes 20 por hora y 100 por día)",
    ],
    [{ limits: { perHour: 5, perDay: 50 } }, "ahora 5 por hora y 50 por día"],
    // El tope mensual de tokens (null: sin tope) y el reenvío de respuestas.
    [{ monthlyLimit: 2_000_000, previousMonthlyLimit: null }, "ahora 2.000.000 tokens al mes (antes sin tope)"],
    [{ monthlyLimit: null, previousMonthlyLimit: 500_000 }, "ahora sin tope (antes 500.000 tokens al mes)"],
    [{ resent: 3, failed: 0 }, "3 reenviadas"],
    [{ resent: 1, failed: 1 }, "1 reenviada · 1 no salió otra vez"],
    [{ resent: 0, failed: 2 }, "0 reenviadas · 2 no salieron otra vez"],
  ])("eventDetail(%j) = %j", (details, expected) => {
    expect(eventDetail(details)).toBe(expected);
  });
});

describe("isAdminAction", () => {
  it.each([
    ["login_unlocked", {}, true],
    ["sessions_revoked", { sessions: 2 }, true],
    ["account_deleted", {}, true],
    ["account_suspended", { note: "Spam" }, true],
    ["account_reactivated", {}, true],
    ["whatsapp_unlinked", { reason: "by_admin" }, true],
    ["whatsapp_unlinked", { reason: "by_user" }, false],
    ["whatsapp_unlinked", { reason: "number_moved" }, false],
    ["registered", {}, false],
    ["whatsapp_link_failed", { reason: "invalid_code" }, false],
  ] as const)("%s %j → %s", (type, details, expected) => {
    expect(isAdminAction({ type, details })).toBe(expected);
  });
});

describe("el chip de acciones del admin en la URL", () => {
  it("va como tipo=admin, cuenta como un filtro y se quita con su ✕", () => {
    const filters = { ...NO_FILTERS, types: ["whatsapp_unlinked", "admin"] as const } as unknown as LogFilters;
    expect(logHref(filters)).toBe("/admin/historial?tipo=whatsapp_unlinked&tipo=admin");
    expect(parseLogFilters({ tipo: ["whatsapp_unlinked", "admin"] })).toEqual(filters);
    expect(activeFilterCount(filters)).toBe(2);
    expect(withoutFilter(filters, { type: "admin" }).types).toEqual(["whatsapp_unlinked"]);
  });
});
