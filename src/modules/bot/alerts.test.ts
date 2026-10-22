import { describe, expect, it } from "vitest";
import { botAlertsFrom, claudeFailureCause, FAILING_IN_A_ROW, isWarning, sendFailureCause, type RecentClaudeCall, type RecentSend } from "./alerts";

// Las alertas del bot salen de lo reciente: sin base, solo la decisión. La consulta se prueba en
// alerts.int.test.ts.

const TOKEN = 'envío: 401 {"error":{"message":"Error validating access token: Session has expired","type":"OAuthException","code":190}}';
const RECIPIENT = 'envío: 400 {"error":{"message":"Recipient phone number not in allowed list","code":131030}}';
const META_DOWN = "envío: 503 Service Unavailable";
const TIMEOUT = "envío: TimeoutError (23)";
const KEY = 'api_error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
const MODEL = 'api_error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}';
const CREDITS = 'api_error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
const OVERLOADED = 'api_error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}';

const at = (minutesAgo: number) => new Date(Date.UTC(2026, 9, 21, 12, 0) - minutesAgo * 60_000);
/** Del más nuevo al más viejo: cada error es una falla; null, un éxito. */
const recent = (...errors: (string | null)[]): RecentSend[] => errors.map((error, i) => ({ at: at(i * 10), error }));
const NO_BUDGET = { limit: null, used: 0, resetsOn: "2026-11-01" };
const alertsOf = ({
  sends = [] as RecentSend[],
  claudeCalls = [] as RecentClaudeCall[],
  budget = NO_BUDGET as { limit: number | null; used: number; resetsOn: string },
  stuck = 0,
}) => botAlertsFrom({ sends, claudeCalls, budget, stuck });

describe("sendFailureCause", () => {
  it.each([
    [TOKEN, "token"],
    ['envío: 400 {"error":{"code":190}}', "token"],
    [RECIPIENT, "recipient"],
    ['envío: 400 {"error":{"code":131047}}', "recipient"],
    [META_DOWN, "other"],
    [TIMEOUT, "other"],
    // Con el error de Claude adelante: cuenta el del envío.
    [`api_error: 529 Overloaded · ${TOKEN}`, "token"],
  ])("%s → %s", (error, cause) => {
    expect(sendFailureCause(error)).toBe(cause);
  });
});

describe("claudeFailureCause", () => {
  it.each([
    [KEY, "key"],
    [MODEL, "model"],
    [CREDITS, "credits"],
    ["not_configured", "config"],
    [OVERLOADED, "transient"],
    ["api_error: Request timed out.", "transient"],
    ["api_error: Connection error.", "transient"],
    // Dependen del mensaje, no de Claude.
    ["refusal: cyber", "content"],
    ["invalid_output: stop_reason=max_tokens", "content"],
  ])("%s → %s", (error, cause) => {
    expect(claudeFailureCause(error)).toBe(cause);
  });
});

describe("botAlertsFrom · WhatsApp", () => {
  it("sin envíos o con el último bien, ninguna alerta", () => {
    expect(alertsOf({})).toEqual([]);
    expect(alertsOf({ sends: recent(null, TOKEN, TOKEN) })).toEqual([]);
  });

  it("el token rechazado alerta con el último envío: desde el primero que falló y cuántas no salieron", () => {
    expect(alertsOf({ sends: recent(TOKEN, TOKEN, null, TOKEN) })).toEqual([{ kind: "whatsapp_token", since: at(10), unsent: 2 }]);
  });

  it("otra causa alerta solo con varios envíos seguidos fallidos (uno suelto puede ser pasajero)", () => {
    expect(alertsOf({ sends: recent(META_DOWN, TIMEOUT, null) })).toEqual([]);
    const sends = recent(...Array(FAILING_IN_A_ROW).fill(META_DOWN), null);
    expect(alertsOf({ sends })).toEqual([{ kind: "whatsapp_send", since: at((FAILING_IN_A_ROW - 1) * 10), unsent: FAILING_IN_A_ROW }]);
  });

  it("un número que no puede recibir (fuera de la lista de prueba de Meta) no es una alerta ni corta la racha", () => {
    expect(alertsOf({ sends: recent(RECIPIENT, RECIPIENT, RECIPIENT) })).toEqual([]);
    expect(alertsOf({ sends: recent(RECIPIENT, TOKEN, null) })).toEqual([{ kind: "whatsapp_token", since: at(10), unsent: 1 }]);
  });
});

describe("botAlertsFrom · Claude", () => {
  const calls = (...errors: (string | null)[]): RecentClaudeCall[] => recent(...errors);

  it.each([
    [KEY, "claude_key"],
    [MODEL, "claude_model"],
    [CREDITS, "claude_credits"],
    ["not_configured", "claude_config"],
  ])("una causa que no se arregla sola (%s) alerta desde la última llamada", (error, kind) => {
    expect(alertsOf({ claudeCalls: calls(error, error, null) })).toEqual([{ kind, since: at(10) }]);
  });

  it("la sobrecarga alerta solo con varias llamadas seguidas fallidas", () => {
    expect(alertsOf({ claudeCalls: calls(OVERLOADED, OVERLOADED, null) })).toEqual([]);
    expect(alertsOf({ claudeCalls: calls(OVERLOADED, OVERLOADED, OVERLOADED, null) })).toEqual([
      { kind: "claude_failing", since: at(20), failures: 3 },
    ]);
  });

  it("una negativa o una salida inválida no cuentan, y una llamada que anduvo apaga la alerta", () => {
    expect(alertsOf({ claudeCalls: calls("refusal: cyber", "invalid_output: x") })).toEqual([]);
    expect(alertsOf({ claudeCalls: calls(null, KEY, KEY) })).toEqual([]);
  });
});

describe("botAlertsFrom · tope mensual y mensajes sin procesar", () => {
  it("sin tope, nada; desde el 80 %, un aviso; al llegar, la alerta", () => {
    expect(alertsOf({ budget: { limit: null, used: 999_999, resetsOn: "2026-11-01" } })).toEqual([]);
    expect(alertsOf({ budget: { limit: 100_000, used: 79_999, resetsOn: "2026-11-01" } })).toEqual([]);
    expect(alertsOf({ budget: { limit: 100_000, used: 80_000, resetsOn: "2026-11-01" } })).toEqual([
      { kind: "monthly_limit_near", share: 0.8, resetsOn: "2026-11-01" },
    ]);
    expect(alertsOf({ budget: { limit: 100_000, used: 100_000, resetsOn: "2026-11-01" } })).toEqual([
      { kind: "monthly_limit", resetsOn: "2026-11-01" },
    ]);
  });

  it("los mensajes sin procesar alertan con cuántos son", () => {
    expect(alertsOf({ stuck: 2 })).toEqual([{ kind: "stuck_messages", count: 2 }]);
  });

  it("de lo más grave a lo menos, y solo el tope cerca es un aviso", () => {
    const alerts = alertsOf({
      sends: recent(TOKEN),
      claudeCalls: recent(CREDITS),
      budget: { limit: 100, used: 90, resetsOn: "2026-11-01" },
      stuck: 1,
    });
    expect(alerts.map((alert) => alert.kind)).toEqual(["whatsapp_token", "claude_credits", "monthly_limit_near", "stuck_messages"]);
    expect(alerts.map(isWarning)).toEqual([false, false, true, false]);
  });
});
