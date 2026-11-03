import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { botSetting, whatsappMessage } from "@/db/schema";

// Las alertas del bot con la base de pruebas: salen de los mensajes como los deja el bot
// (src/modules/bot/handle-message.ts) y de su configuración. La decisión se prueba en alerts.test.ts.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const { collectBotAlerts } = await import("./alerts");
const { botAlerts } = await import("@/modules/admin/bot/alerts");

beforeEach(() => {
  auth.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
});

const NOW = new Date("2026-10-21T15:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const TOKEN = 'envío: 401 {"error":{"message":"Session has expired","type":"OAuthException","code":190}}';
const KEY = 'api_error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
const usage = (tokens: number) => ({ model: "claude-haiku-5-5", inputTokens: tokens, outputTokens: 0 });

type Message = Partial<typeof whatsappMessage.$inferInsert>;
const message = (minutes: number, values: Message = {}) =>
  db.insert(whatsappMessage).values({
    id: `wamid.${randomUUID()}`,
    phone: "573001112233",
    body: "almuerzo 20 mil",
    status: "processed",
    reply: "✅ Egreso Anotado",
    receivedAt: minutesAgo(minutes),
    processedAt: minutesAgo(minutes),
    ...values,
  });

describe("collectBotAlerts", () => {
  it("sin mensajes ni tope, ninguna alerta", async () => {
    expect(await collectBotAlerts(NOW)).toEqual([]);
  });

  it("el token de WhatsApp: desde el primer envío fallido después del último que salió", async () => {
    await message(90);
    await message(60, { status: "failed", error: TOKEN });
    await message(30, { status: "failed", error: `api_error: Overloaded · ${TOKEN}` });
    expect(await collectBotAlerts(NOW)).toEqual([{ kind: "whatsapp_token", since: minutesAgo(60), unsent: 2 }]);

    // Un error de Claude con el envío bien (sin "envío:") cuenta como un envío que salió: apaga la alerta.
    await message(10, { status: "failed", error: "refusal: cyber", intent: { kind: "error", reason: "refusal: cyber" } });
    expect(await collectBotAlerts(NOW)).toEqual([]);
  });

  it("una respuesta reenviada que salió (queda processed, con el error del envío) cuenta como enviada", async () => {
    await message(60, { status: "failed", error: TOKEN });
    await message(30, { status: "processed", error: TOKEN });
    expect(await collectBotAlerts(NOW)).toEqual([]);
  });

  it("Claude: la última llamada con la API key rechazada; una que anduvo después la apaga", async () => {
    await message(60, { status: "failed", error: KEY, intent: { kind: "error", reason: KEY }, aiRequestedAt: minutesAgo(60) });
    // Un comando no llama a Claude: no cambia nada.
    await message(30, { intent: { kind: "command", command: "balance" } });
    expect(await collectBotAlerts(NOW)).toEqual([{ kind: "claude_key", since: minutesAgo(60) }]);

    await message(10, { intent: { kind: "reply", text: "ok", usage: usage(100) }, aiRequestedAt: minutesAgo(10) });
    expect(await collectBotAlerts(NOW)).toEqual([]);
  });

  it("el tope mensual: los tokens de este mes frente al de la configuración", async () => {
    await db.insert(botSetting).values({ id: 1, aiPerHour: 20, aiPerDay: 100, monthlyTokenLimit: 10_000 });
    await message(60, { intent: { kind: "reply", text: "ok", usage: usage(8_000) }, aiRequestedAt: minutesAgo(60) });
    expect(await collectBotAlerts(NOW)).toEqual([{ kind: "monthly_limit_near", share: 0.8, resetsOn: "2026-11-01" }]);
    await message(30, { intent: { kind: "reply", text: "ok", usage: usage(2_000) }, aiRequestedAt: minutesAgo(30) });
    expect(await collectBotAlerts(NOW)).toEqual([{ kind: "monthly_limit", resetsOn: "2026-11-01" }]);
  });

  it("los mensajes sin procesar: de más de 10 minutos y de las últimas 24 horas", async () => {
    await message(20, { status: "received", reply: null, processedAt: null });
    await message(5, { status: "received", reply: null, processedAt: null });
    await message(2 * 24 * 60, { status: "received", reply: null, processedAt: null });
    expect(await collectBotAlerts(NOW)).toEqual([{ kind: "stuck_messages", count: 1 }]);
  });
});

describe("botAlerts (admin)", () => {
  it("pide la sesión de admin antes de consultar", async () => {
    auth.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(botAlerts(NOW)).rejects.toThrow("NEXT_REDIRECT");
    auth.requireAdmin.mockResolvedValue({ id: "admin" });
    expect(await botAlerts(NOW)).toEqual([]);
  });
});
