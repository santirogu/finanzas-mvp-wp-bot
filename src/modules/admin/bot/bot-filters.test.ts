import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SORTS,
  ACCOUNT_SORT_LABELS,
  ACCOUNT_SORT_TEXTS,
  BOT_PATH,
  CLAUDE_DAYS_WHEN_ALL,
  NO_BOT_FILTERS,
  OUTCOMES,
  MAX_RESENDS,
  OUTCOME_LABELS,
  OUTCOME_TEXTS,
  PROBLEM_OUTCOMES,
  RESEND_WINDOW_HOURS,
  activeBotFilters,
  botHref,
  claudeDays,
  connectionView,
  errorLabel,
  formatCount,
  formatDayMonth,
  formatSeconds,
  formatShortDay,
  lastSeenLabel,
  parseBotFilters,
  showMoreAccounts,
  toggleOutcome,
  readableApiError,
} from "./bot-filters";

const TODAY = "2026-10-12";

describe("parseBotFilters y botHref", () => {
  it("sin parámetros, sin filtros", () => {
    expect(parseBotFilters({})).toEqual(NO_BOT_FILTERS);
    expect(botHref(NO_BOT_FILTERS)).toBe("/admin/bot");
  });

  it("lee la búsqueda y la fecha, y las vuelve a escribir igual", () => {
    const filters = parseBotFilters({ q: "  ana  ", fecha: "personalizado", desde: "2026-10-09", hasta: "2026-10-01" });
    expect(filters).toEqual({ ...NO_BOT_FILTERS, search: "ana", date: "personalizado", from: "2026-10-01", to: "2026-10-09" });
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

describe("resultado, orden y Ver más", () => {
  it("lee el resultado, el orden y cuántas cuentas mostrar; lo que no es válido, por defecto", () => {
    expect(parseBotFilters({ resultado: "error", orden: "errores", mostrar: "100" })).toMatchObject({
      outcome: "error",
      sort: "errores",
      limit: 100,
    });
    expect(parseBotFilters({ resultado: "inventado", orden: "nombre", mostrar: "7" })).toMatchObject({
      outcome: null,
      sort: "tokens",
      limit: 50,
    });
  });

  it("los escribe en la URL solo si no son los de siempre", () => {
    const filters = parseBotFilters({ q: "ana", resultado: "tope_claude", fecha: "7d", orden: "ultimo", mostrar: "100" });
    expect(botHref(filters)).toBe(`${BOT_PATH}?q=ana&resultado=tope_claude&fecha=7d&orden=ultimo&mostrar=100`);
    expect(botHref({ ...filters, sort: "tokens", limit: 50 })).toBe(`${BOT_PATH}?q=ana&resultado=tope_claude&fecha=7d`);
  });

  it("el resultado es un filtro activo con su ✕; quitar cualquiera vuelve a la primera página", () => {
    const filters = parseBotFilters({ resultado: "error", fecha: "hoy", orden: "mensajes", mostrar: "150" });
    expect(activeBotFilters(filters)).toEqual([
      { label: "Resultado: Error", href: `${BOT_PATH}?fecha=hoy&orden=mensajes` },
      { label: "Hoy", href: `${BOT_PATH}?resultado=error&orden=mensajes` },
    ]);
  });

  it("tocar una barra filtra por ese resultado; tocarla otra vez lo quita", () => {
    const filters = parseBotFilters({ resultado: "registrado", mostrar: "100" });
    expect(toggleOutcome(filters, "error")).toMatchObject({ outcome: "error", limit: 50 });
    expect(toggleOutcome(filters, "registrado")).toMatchObject({ outcome: null, limit: 50 });
  });

  it("Ver más suma 50 cuentas, hasta 500", () => {
    expect(showMoreAccounts(NO_BOT_FILTERS).limit).toBe(100);
    expect(showMoreAccounts({ ...NO_BOT_FILTERS, limit: 480 }).limit).toBe(500);
  });

  it("los órdenes tienen su nombre", () => {
    expect(ACCOUNT_SORTS.map((s) => ACCOUNT_SORT_LABELS[s])).toEqual(["Tokens", "Mensajes", "Errores", "Último mensaje"]);
  });
});

describe("lastSeenLabel", () => {
  it.each([
    ["2026-10-12T15:00:00Z", "hoy"],
    // 11:30 p. m. del 11 en Colombia (ya es el 12 en UTC): ayer.
    ["2026-10-12T04:30:00Z", "ayer"],
    ["2026-10-11T05:00:00Z", "ayer"],
    ["2026-10-02T15:00:00Z", "2 oct"],
  ])("%s → %s", (iso, label) => {
    expect(lastSeenLabel(new Date(iso), TODAY)).toBe(label);
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

// Lo que de verdad respondieron Meta y Anthropic (el primero, de producción, el 13 de octubre de 2026).
const META_131030 =
  '400 {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030,"type":"OAuthException","error_data":{"messaging_product":"whatsapp","details":"El número de teléfono del destinatario no está en la lista de autorizados: Agrega el número de teléfono del destinatario a la lista de destinatarios y vuelve a intentarlo."},"fbtrace_id":"AKrw3fJ7aDnkLUcNSu3rO_K"}}';
const ANTHROPIC_529 = '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011"}';

describe("readableApiError", () => {
  it("de Meta, la explicación en español con su código", () => {
    expect(readableApiError(META_131030)).toBe(
      "HTTP 400 · (#131030) El número de teléfono del destinatario no está en la lista de autorizados: Agrega el número de teléfono del destinatario a la lista de destinatarios y vuelve a intentarlo.",
    );
  });

  it("sin explicación, el mensaje (sin repetir el código si ya lo trae)", () => {
    expect(readableApiError('401 {"error":{"message":"(#190) Invalid OAuth access token","code":190}}')).toBe(
      "HTTP 401 · (#190) Invalid OAuth access token",
    );
    expect(readableApiError('400 {"error":{"message":"Bad request","code":100}}')).toBe("HTTP 400 · (#100) Bad request");
  });

  it("de Anthropic, el mensaje", () => {
    expect(readableApiError(ANTHROPIC_529)).toBe("HTTP 529 · Overloaded");
  });

  it.each([
    ["cortado (la app guarda hasta 500 caracteres)", META_131030.slice(0, 120)],
    ["sin mensaje", '500 {"error":{"type":"x"}}'],
    ["sin el estado HTTP", '{"error":{"message":"x"}}'],
    ["texto común", "400 (#131030) Recipient not allowed"],
    ["un JSON que no es objeto", "500 {no es json}"],
    ["con texto antes", `envío fallido ${ANTHROPIC_529}`],
    ["con texto después", `${ANTHROPIC_529} (reintento)`],
  ])("si no es ese formato (%s), lo deja igual", (_, detail) => {
    expect(readableApiError(detail)).toBe(detail);
  });
});

describe("formatDayMonth y el reenvío", () => {
  it("el día con el mes en letras", () => {
    expect(formatDayMonth("2026-11-01")).toBe("1 de noviembre");
    expect(formatDayMonth("2027-01-01")).toBe("1 de enero");
  });

  it("se reenvían como mucho 50, de las últimas 24 horas (la ventana de Meta)", () => {
    expect([RESEND_WINDOW_HOURS, MAX_RESENDS]).toEqual([24, 50]);
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
    [`envío: ${META_131030}`, "No se pudo enviar la respuesta por WhatsApp", readableApiError(META_131030)],
    [`api_error: ${ANTHROPIC_529}`, "Error de la API de Claude", "HTTP 529 · Overloaded"],
    ["PostgresError (23505)", "Error interno de la app", "PostgresError (23505)"],
    [
      "Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.",
      "Claude no está configurado (falta la API key)",
      "Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.",
    ],
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

  it("se resaltan los topes de Claude, los errores y los que no se procesaron", () => {
    expect(PROBLEM_OUTCOMES).toEqual(["tope_claude", "tope_mensual", "error", "pendiente"]);
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

describe("connectionView", () => {
  it("conectado, con su detalle y su aviso", () => {
    expect(connectionView("whatsapp", { status: "ok", detail: "Finanzas MVP · +1 555-662-5913" })).toEqual({
      ok: true,
      title: "Conectado",
      detail: "Finanzas MVP · +1 555-662-5913",
      warning: null,
    });
    expect(connectionView("claude", { status: "ok", detail: "Claude Haiku 5.5", warning: { kind: "deprecated_model", since: "2027-03-01" } })).toMatchObject({
      ok: true,
      warning: "Anthropic marcó el modelo como obsoleto (2027-03-01): conviene cambiarlo.",
    });
    expect(connectionView("whatsapp", { status: "ok", detail: null, warning: { kind: "low_quality", quality: "YELLOW" } })).toEqual({
      ok: true,
      title: "Conectado",
      detail: null,
      warning: "Meta marca la calidad del número como YELLOW: podría limitar los envíos.",
    });
  });

  it("sin configurar: qué variables faltan y dónde se configuran", () => {
    expect(connectionView("whatsapp", { status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] })).toEqual({
      ok: false,
      title: "Falta configurar WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID",
      detail: "Se configura en Vercel → Settings → Environment Variables (y en .env en local).",
      warning: null,
    });
  });

  const metaError = (status: number, code: number, message: string) => `${status} ${JSON.stringify({ error: { message, code } })}`;

  it.each([
    ["whatsapp", metaError(401, 190, "Error validating access token: Session has expired."), "El token de WhatsApp no sirve: vencido, revocado o mal copiado", "HTTP 401 · (#190) Error validating access token: Session has expired."],
    ["whatsapp", metaError(400, 190, "Invalid OAuth access token"), "El token de WhatsApp no sirve: vencido, revocado o mal copiado", "HTTP 400 · (#190) Invalid OAuth access token"],
    ["whatsapp", metaError(403, 200, "Permissions error"), "El token no tiene permiso para leer el número (whatsapp_business_management); los envíos pueden funcionar igual", "HTTP 403 · (#200) Permissions error"],
    ["whatsapp", metaError(400, 10, "Application does not have permission"), "El token no tiene permiso para leer el número (whatsapp_business_management); los envíos pueden funcionar igual", "HTTP 400 · (#10) Application does not have permission"],
    ["claude", '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', "La API key de Claude no sirve: vencida, revocada o mal copiada", "HTTP 401 · invalid x-api-key"],
    ["claude", '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}', "El modelo del bot no existe o la API key no tiene acceso a él (BOT_MODEL)", "HTTP 404 · model: claude-x"],
    ["claude", '403 {"type":"error","error":{"type":"permission_error","message":"no"}}', "La API key de Claude no tiene permiso", "HTTP 403 · no"],
    ["whatsapp", '403 {"error":{"message":"Forbidden"}}', "El token de WhatsApp no tiene permiso", "HTTP 403 · Forbidden"],
    ["whatsapp", metaError(404, 100, "Unsupported get request"), "El servicio respondió con un error", "HTTP 404 · (#100) Unsupported get request"],
    ["claude", "529 Overloaded", "El servicio respondió con un error", "529 Overloaded"],
  ] as const)("%s %s → %s", (service, error, title, detail) => {
    expect(connectionView(service, { status: "error", error })).toEqual({ ok: false, title, detail, warning: null });
  });

  it.each(["TimeoutError (23)", "TimeoutError", "AbortError (20)"])("%s: no respondió a tiempo", (error) => {
    expect(connectionView("claude", { status: "error", error })).toEqual({ ok: false, title: "No respondió a tiempo (8 s)", detail: null, warning: null });
  });

  it.each(["TypeError", "APIConnectionError", "Connection error."])("%s: no se pudo conectar", (error) => {
    expect(connectionView("whatsapp", { status: "error", error })).toEqual({
      ok: false,
      title: "No se pudo conectar con el servicio",
      detail: error,
      warning: null,
    });
  });

  it.each([
    // El nombre de un error dentro del mensaje del servicio no es un error de la conexión.
    ["claude", '500 {"type":"error","error":{"type":"api_error","message":"TimeoutError upstream"}}', "HTTP 500 · TimeoutError upstream"],
    ["whatsapp", '500 {"error":{"message":"TypeError in handler"}}', "HTTP 500 · TypeError in handler"],
    ["claude", "Error 401 inesperado", "Error 401 inesperado"],
    // El "code" de un permiso de Meta no significa nada en un error de Anthropic.
    ["claude", '400 {"error":{"message":"x","code":200}}', "HTTP 400 · (#200) x"],
  ] as const)("%s %s → error genérico", (service, error, detail) => {
    expect(connectionView(service, { status: "error", error })).toEqual({ ok: false, title: "El servicio respondió con un error", detail, warning: null });
  });

  it("un 404 de Meta no es un modelo que falta", () => {
    expect(connectionView("whatsapp", { status: "error", error: "404 {}" }).title).toBe("El servicio respondió con un error");
  });
});

describe("en inglés", () => {
  it("los resultados y el orden, con las mismas claves", () => {
    expect(Object.keys(OUTCOME_TEXTS.en)).toEqual(Object.keys(OUTCOME_TEXTS.es));
    expect(OUTCOME_TEXTS.en.registrado).toBe("Recorded transactions");
    expect(OUTCOME_TEXTS.en.tope_mensual).toBe("Monthly token limit reached (asked to use the web)");
    expect(OUTCOME_LABELS).toBe(OUTCOME_TEXTS.es);
    expect(ACCOUNT_SORTS.map((s) => ACCOUNT_SORT_TEXTS.en[s])).toEqual(["Tokens", "Messages", "Errors", "Last message"]);
    expect(ACCOUNT_SORT_LABELS).toBe(ACCOUNT_SORT_TEXTS.es);
  });

  it("las etiquetas de los filtros activos", () => {
    const filters = { ...NO_BOT_FILTERS, search: "ana", outcome: "error" as const, date: "7d" as const };
    expect(activeBotFilters(filters, "en").map((f) => f.label)).toEqual(["“ana”", "Result: Error", "Last 7 days"]);
    expect(activeBotFilters(filters).map((f) => f.label)).toEqual(["“ana”", "Resultado: Error", "Últimos 7 días"]);
  });

  it("los números, los segundos y las fechas con el formato de Estados Unidos", () => {
    expect(formatCount(18_400, "en")).toBe("18,400");
    expect(formatSeconds(0.84, "en")).toBe("0.8 s");
    expect(formatSeconds(12, "en")).toBe("12 s");
    expect(formatShortDay("2026-10-12", "en")).toBe("Oct 12");
    expect(formatDayMonth("2026-11-01", "en")).toBe("November 1");
    const today = "2026-10-15";
    expect(lastSeenLabel(new Date("2026-10-15T15:00:00Z"), today, "en")).toBe("today");
    expect(lastSeenLabel(new Date("2026-10-14T15:00:00Z"), today, "en")).toBe("yesterday");
    expect(lastSeenLabel(new Date("2026-10-13T15:00:00Z"), today, "en")).toBe("Oct 13");
  });

  it.each([
    ["envío: 400 {}", "The reply couldn't be sent over WhatsApp"],
    ["not_configured", "Claude isn't set up (the API key is missing)"],
    ["refusal: no", "Claude declined to answer"],
    ["invalid_output: x", "Claude answered in a format that couldn't be read"],
    ["api_error: 500 x", "Claude API error"],
    [": algo", "Error with no detail"],
    ["Could not resolve authentication method", "Claude isn't set up (the API key is missing)"],
    ["TypeError: x", "Internal app error"],
  ])("el error %j", (error, label) => {
    expect(errorLabel(error, "en").label).toBe(label);
  });

  it("las conexiones", () => {
    expect(connectionView("whatsapp", { status: "ok", detail: "Finanzas MVP", warning: { kind: "low_quality", quality: "RED" } }, "en")).toEqual({
      ok: true,
      title: "Connected",
      detail: "Finanzas MVP",
      warning: "Meta rates the number's quality as RED: it could limit sending.",
    });
    expect(connectionView("claude", { status: "ok", detail: null, warning: { kind: "deprecated_model", since: "2027-03-01" } }, "en").warning).toBe(
      "Anthropic marked the model as deprecated (2027-03-01): it's worth changing it.",
    );
    expect(connectionView("whatsapp", { status: "sin_configurar", missing: ["A", "B"] }, "en")).toMatchObject({
      title: "A and B aren't set up",
      detail: "It's set up in Vercel → Settings → Environment Variables (and in .env locally).",
    });
    expect(connectionView("claude", { status: "sin_configurar", missing: ["ANTHROPIC_API_KEY"] }, "en").title).toBe("ANTHROPIC_API_KEY isn't set up");
    const title = (service: "whatsapp" | "claude", error: string) => connectionView(service, { status: "error", error }, "en").title;
    expect(title("claude", "TimeoutError (23)")).toBe("It didn't answer in time (8 s)");
    expect(title("claude", "APIConnectionError")).toBe("Couldn't connect to the service");
    expect(title("whatsapp", '400 {"error":{"message":"x","code":200}}')).toBe(
      "The token isn't allowed to read the number (whatsapp_business_management); sending may still work",
    );
    expect(title("whatsapp", '401 {"error":{"message":"x","code":190}}')).toBe("The WhatsApp token doesn't work: expired, revoked or copied wrong");
    expect(title("claude", "401 {}")).toBe("The Claude API key doesn't work: expired, revoked or copied wrong");
    expect(title("claude", "404 {}")).toBe("The bot's model doesn't exist or the API key can't use it (BOT_MODEL)");
    expect(title("whatsapp", "403 {}")).toBe("The WhatsApp token isn't allowed");
    expect(title("claude", "403 {}")).toBe("The Claude API key isn't allowed");
    expect(title("claude", "500 {}")).toBe("The service answered with an error");
  });
});
