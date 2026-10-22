import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotAlert } from "@/modules/bot/alert-rules";

// Lo que revisa se simula (cada parte tiene sus pruebas): aquí, el secreto, qué responde y que no da detalles.
const mocks = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  checkWhatsAppConnection: vi.fn(),
  checkClaudeConnection: vi.fn(),
  collectBotAlerts: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: vi.fn() }));
vi.mock("@/lib/health", () => ({ checkHealth: mocks.checkHealth }));
vi.mock("@/modules/whatsapp/client", () => ({ checkWhatsAppConnection: mocks.checkWhatsAppConnection }));
vi.mock("@/modules/bot/claude-extractor", () => ({ checkClaudeConnection: mocks.checkClaudeConnection }));
vi.mock("@/modules/bot/alerts", () => ({ collectBotAlerts: mocks.collectBotAlerts }));

const { GET } = await import("./route");

const SECRET = "secreto-de-prueba";
const call = (authorization: string | null = `Bearer ${SECRET}`) =>
  GET(new Request("https://app.test/api/cron/vigilancia", { headers: authorization ? { authorization } : {} }));
const TOKEN: BotAlert = { kind: "whatsapp_token", since: new Date(), unsent: 1 };

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  mocks.checkHealth.mockResolvedValue({ ok: true, problems: [] });
  mocks.checkWhatsAppConnection.mockResolvedValue({ status: "ok", detail: "Anotado" });
  mocks.checkClaudeConnection.mockResolvedValue({ status: "ok", detail: "Claude Haiku 5.5" });
  mocks.collectBotAlerts.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/vigilancia", () => {
  it.each([[null], ["Bearer otro"], [`Bearer ${SECRET}x`]])("sin el secreto (%s): 401, sin revisar nada", async (authorization) => {
    const response = await call(authorization);
    expect(response.status).toBe(401);
    expect(mocks.checkWhatsAppConnection).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado, nadie entra", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call()).status).toBe(401);
  });

  it("todo en orden: ok, sin problemas y sin caché", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, problems: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("con fallas, solo de qué tipo (sin el error, el token ni el detalle) y al log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.checkWhatsAppConnection.mockResolvedValue({ status: "error", error: '401 {"error":{"message":"Session has expired","code":190}}' });
    mocks.collectBotAlerts.mockResolvedValue([TOKEN]);
    const response = await call();
    const body = await response.json();
    expect(body).toEqual({ ok: false, problems: ["whatsapp", "bot_alerts"] });
    expect(JSON.stringify(body)).not.toContain("Session");
    expect(log).toHaveBeenCalledWith("[vigilancia] hay problemas", { problemas: ["whatsapp", "bot_alerts"] });
  });

  it("si no se pueden leer las alertas (la base no responde), lo dice la revisión de la app", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.checkHealth.mockResolvedValue({ ok: false, problems: ["database"] });
    mocks.collectBotAlerts.mockRejectedValue(new Error("connect ECONNREFUSED"));
    expect(await (await call()).json()).toEqual({ ok: false, problems: ["app"] });
  });
});
