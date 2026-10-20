import { afterEach, describe, expect, it, vi } from "vitest";

// El simulador procesa mensajes como si llegaran por WhatsApp desde cualquier número: por eso
// solo existe en desarrollo. Se simulan la sesión y el flujo del bot (tiene sus propias pruebas).
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), handle: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/modules/bot/handle-message", () => ({ handleIncomingMessage: mocks.handle }));
vi.mock("@/modules/bot/claude-extractor", () => ({ claudeExtractor: "extractor-simulado" }));

const { simulateMessageAction } = await import("./actions");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("simulateMessageAction", () => {
  it("en producción se niega antes de leer la sesión o procesar algo", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(simulateMessageAction("573001112233", "balance")).rejects.toThrow(
      "Simulador deshabilitado en producción",
    );
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("en desarrollo exige sesión antes de procesar el mensaje", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(simulateMessageAction("573001112233", "balance")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("con sesión procesa el mensaje sin enviar nada a WhatsApp", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.handle.mockResolvedValue({ duplicate: false, reply: "Hola", status: "processed", intent: null });

    const result = await simulateMessageAction("+57 300 111 2233", "ayuda");

    expect(result).toEqual({ reply: "Hola", status: "processed", intent: null });
    const [message, deps] = mocks.handle.mock.calls[0];
    expect(message).toMatchObject({ from: "573001112233", text: "ayuda", type: "text" });
    expect(message.id).toMatch(/^sim\./);
    expect(message.timestamp).toBeCloseTo(Date.now() / 1000, -1); // en segundos, como Meta
    expect(await deps.send("573001112233", "x")).toEqual({ ok: true });
  });

  it("muestra la intención interpretada y avisa si el mensaje era un duplicado", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.requireUser.mockResolvedValue({ id: "u1" });
    mocks.handle.mockResolvedValueOnce({
      duplicate: false,
      reply: "Listo",
      status: "processed",
      intent: { kind: "balance" },
    });
    mocks.handle.mockResolvedValueOnce({ duplicate: true });

    expect(await simulateMessageAction("573001112233", "balance")).toEqual({
      reply: "Listo",
      status: "processed",
      intent: JSON.stringify({ kind: "balance" }, null, 2),
    });
    expect(await simulateMessageAction("573001112233", "balance")).toEqual({
      reply: "(duplicado)",
      status: "duplicate",
      intent: null,
    });
  });
});
