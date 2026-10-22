import { describe, expect, it } from "vitest";
import type { BotAlert } from "@/modules/bot/alert-rules";
import { alertView } from "./alerts-view";

// Cada alerta del bot en una frase, con desde cuándo y qué hacer, en los dos idiomas.

const SINCE = new Date("2026-10-21T14:30:00Z");
const text = (s: string | null) => s?.replace(/\s/g, " ") ?? null;
const view = (alert: BotAlert, locale: "es" | "en" = "es") => {
  const v = alertView(alert, locale);
  return { ...v, title: text(v.title), detail: text(v.detail) };
};

describe("alertView", () => {
  it("el token de WhatsApp: desde cuándo, cuántas respuestas no salieron y cómo cambiarlo", () => {
    const es = view({ kind: "whatsapp_token", since: SINCE, unsent: 3 });
    expect(es.title).toBe("El token de WhatsApp no sirve: el bot no puede responder");
    expect(es.detail).toBe("Desde el 21 de oct. de 2026, 9:30 a. m. · 3 respuestas no salieron");
    expect(es.action).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(es.warning).toBe(false);
    expect(view({ kind: "whatsapp_token", since: SINCE, unsent: 1 }).detail).toContain("1 respuesta no salió");
    const en = view({ kind: "whatsapp_token", since: SINCE, unsent: 1 }, "en");
    expect(en.title).toBe("The WhatsApp token doesn't work: the bot can't reply");
    expect(en.detail).toBe("Since Oct 21, 2026, 9:30 AM · 1 reply didn't go out");
  });

  it.each([
    [{ kind: "whatsapp_send", since: SINCE, unsent: 4 }, "WhatsApp no está enviando las respuestas", "WhatsApp isn't sending the replies"],
    [{ kind: "claude_key", since: SINCE }, "La API key de Claude no sirve: el bot no entiende lo que se escribe libremente", "The Claude API key doesn't work: the bot can't understand freely written messages"],
    [{ kind: "claude_model", since: SINCE }, "El modelo del bot no existe o la API key no tiene acceso a él", "The bot's model doesn't exist or the API key can't use it"],
    [{ kind: "claude_credits", since: SINCE }, "La cuenta de Anthropic se quedó sin créditos", "The Anthropic account ran out of credits"],
    [{ kind: "claude_config", since: SINCE }, "Falta configurar Claude (ANTHROPIC_API_KEY)", "Claude isn't set up (ANTHROPIC_API_KEY)"],
    [{ kind: "claude_failing", since: SINCE, failures: 3 }, "Claude está fallando: las últimas 3 llamadas dieron error", "Claude is failing: the last 3 calls returned an error"],
    [{ kind: "monthly_limit", resetsOn: "2026-11-01" }, "Se alcanzó el tope mensual de tokens: Claude está en pausa hasta el 1 de noviembre", "The monthly token limit was reached: Claude is paused until November 1"],
    [{ kind: "monthly_limit_near", share: 0.856, resetsOn: "2026-11-01" }, "Ya se usó el 85 % del tope mensual de tokens", "85% of the monthly token limit is already used"],
    [{ kind: "stuck_messages", count: 1 }, "1 mensaje de las últimas 24 horas quedó sin procesar", "1 message from the last 24 hours wasn't processed"],
    [{ kind: "stuck_messages", count: 2 }, "2 mensajes de las últimas 24 horas quedaron sin procesar", "2 messages from the last 24 hours weren't processed"],
  ] as const)("%j", (alert, es, en) => {
    expect(view(alert).title).toBe(es);
    expect(view(alert, "en").title).toBe(en);
    expect(view(alert).action.length).toBeGreaterThan(0);
  });

  it("solo el tope mensual cerca es un aviso; dice cuándo se pausaría", () => {
    const near = view({ kind: "monthly_limit_near", share: 0.8, resetsOn: "2026-11-01" });
    expect(near.warning).toBe(true);
    expect(near.action).toContain("1 de noviembre");
    expect(view({ kind: "monthly_limit", resetsOn: "2026-11-01" }).warning).toBe(false);
  });
});
