import { describe, expect, it } from "vitest";
import type { ServiceCheck } from "@/lib/service-check";
import type { BotAlert } from "@/modules/bot/alert-rules";
import { watchProblems } from "./watch";

const OK: ServiceCheck = { status: "ok", detail: null };
const all = (changes: Partial<Parameters<typeof watchProblems>[0]> = {}) =>
  watchProblems({ healthOk: true, whatsapp: OK, claude: OK, botAlerts: [], ...changes });
const TOKEN: BotAlert = { kind: "whatsapp_token", since: new Date(), unsent: 1 };
const NEAR: BotAlert = { kind: "monthly_limit_near", share: 0.9, resetsOn: "2026-11-01" };

describe("watchProblems", () => {
  it("todo en orden: ningún problema (un aviso, como un modelo obsoleto o el tope cerca, no cuenta)", () => {
    expect(all()).toEqual([]);
    expect(all({ claude: { status: "ok", detail: "Claude", warning: { kind: "deprecated_model", since: "2026-12-01" } } })).toEqual([]);
    expect(all({ botAlerts: [NEAR] })).toEqual([]);
  });

  it("cada falla, de lo más grave a lo menos", () => {
    expect(
      all({
        healthOk: false,
        whatsapp: { status: "error", error: '401 {"error":{"code":190}}' },
        claude: { status: "sin_configurar", missing: ["ANTHROPIC_API_KEY"] },
        botAlerts: [TOKEN],
      }),
    ).toEqual(["app", "whatsapp", "claude", "bot_alerts"]);
  });

  it("un token de WhatsApp sin permiso para leer el número (10 o 200) puede enviar igual: no es un problema", () => {
    expect(all({ whatsapp: { status: "error", error: '403 {"error":{"message":"(#10) Application does not have permission","code":10}}' } })).toEqual([]);
    expect(all({ whatsapp: { status: "error", error: '403 {"error":{"code":200}}' } })).toEqual([]);
    expect(all({ whatsapp: { status: "error", error: "TimeoutError (23)" } })).toEqual(["whatsapp"]);
    expect(all({ whatsapp: { status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN"] } })).toEqual(["whatsapp"]);
  });
});
