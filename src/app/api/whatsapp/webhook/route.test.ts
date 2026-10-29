import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signBody } from "@/modules/whatsapp/signature";

// after() se captura para ejecutar el procesamiento a mano; el flujo del bot se simula
// (ya tiene sus pruebas de integración). Nada sale a Meta ni a Claude.
const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  handle: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => mocks.afterCallbacks.push(callback),
}));
vi.mock("@/modules/bot/handle-message", () => ({ handleIncomingMessage: mocks.handle }));
vi.mock("@/modules/bot/claude-extractor", () => ({ claudeExtractor: "extractor-simulado" }));
vi.mock("@/modules/whatsapp/client", () => ({ sendWhatsAppText: "sender-simulado", downloadWhatsAppMedia: "descarga-simulada" }));

const { NextRequest } = await import("next/server");
const { GET, POST } = await import("./route");

const URL_BASE = "https://app.test/api/whatsapp/webhook";
const SECRET = "app-secret-de-prueba";

const verify = (params: Record<string, string>) =>
  GET(new NextRequest(`${URL_BASE}?${new URLSearchParams(params)}`));

function post(body: string, signature?: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("x-hub-signature-256", signature ?? signBody(body, SECRET));
  return POST(new NextRequest(URL_BASE, { method: "POST", body, headers }));
}

const payload = (messages: unknown[]) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages } }] }],
  });

const textMessage = (id: string, body: string) => ({
  id,
  from: "573001112233",
  timestamp: "1791950000",
  type: "text",
  text: { body },
});

beforeEach(() => {
  mocks.afterCallbacks.length = 0;
  mocks.handle.mockReset();
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "token-secreto\n");
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
  vi.stubEnv("BETTER_AUTH_URL", "https://finanzas.test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET · verificación del webhook", () => {
  it("devuelve el challenge si el token coincide (ignorando el salto de línea del env)", async () => {
    const res = await verify({
      "hub.mode": "subscribe",
      "hub.verify_token": "token-secreto",
      "hub.challenge": "reto-123",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("reto-123");
  });

  it.each([
    ["token incorrecto", { "hub.mode": "subscribe", "hub.verify_token": "otro" }],
    [
      "modo distinto a subscribe",
      { "hub.mode": "unsubscribe", "hub.verify_token": "token-secreto" },
    ],
    ["sin parámetros", {}],
  ])("responde 403 con %s", async (_, params) => {
    expect((await verify({ ...params, "hub.challenge": "x" })).status).toBe(403);
  });

  it("responde 403 si no hay token configurado, aunque envíen uno vacío", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    const res = await verify({
      "hub.mode": "subscribe",
      "hub.verify_token": "",
      "hub.challenge": "x",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST · mensajes entrantes", () => {
  it("rechaza con 401 si falta la firma, es falsa o no hay App Secret", async () => {
    const body = payload([textMessage("wamid.A", "balance")]);

    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, signBody(body, "otro-secreto"))).status).toBe(401);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await post(body)).status).toBe(401);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("rechaza con 400 un cuerpo firmado que no es JSON", async () => {
    expect((await post("esto no es json")).status).toBe(400);
  });

  it("responde 200 de inmediato y procesa los mensajes después", async () => {
    const body = payload([textMessage("wamid.A", "balance"), textMessage("wamid.B", "ayuda")]);

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled(); // todavía no: se procesa en after()
    expect(mocks.afterCallbacks).toHaveLength(1);

    await mocks.afterCallbacks[0]();
    expect(mocks.handle).toHaveBeenCalledTimes(2);
    expect(mocks.handle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "wamid.A", text: "balance" }),
      { extractor: "extractor-simulado", send: "sender-simulado", appUrl: "https://finanzas.test", download: "descarga-simulada" },
    );
  });

  it("si un mensaje falla, sigue con los demás y en el log va solo el tipo del error", async () => {
    const dbError = Object.assign(new Error("Failed query\nparams: 573001112233,uno"), { name: "DrizzleQueryError" });
    mocks.handle.mockRejectedValueOnce(dbError).mockResolvedValueOnce(undefined);
    await post(payload([textMessage("wamid.A", "uno"), textMessage("wamid.B", "dos")]));

    await mocks.afterCallbacks[0]();

    expect(mocks.handle).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith("[whatsapp] no se pudo procesar", "wamid.A", "DrizzleQueryError");
  });

  it("acepta notificaciones de estado (entregado/leído) sin procesar nada", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        { changes: [{ field: "messages", value: { statuses: [{ id: "x", status: "read" }] } }] },
      ],
    });

    expect((await post(body)).status).toBe(200);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});

describe("respuestas y registros del webhook", () => {
  it("responde con textos claros en cada caso", async () => {
    const forbidden = await verify({ "hub.mode": "subscribe", "hub.verify_token": "otro" });
    expect(await forbidden.text()).toBe("Forbidden");

    const unsigned = await post(payload([]), null);
    expect(await unsigned.text()).toBe("Invalid signature");

    const badJson = await post("no es json");
    expect(await badJson.text()).toBe("Bad request");

    const ok = await post(payload([]));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("OK");
  });

  it("si Meta no envía challenge, responde vacío", async () => {
    const res = await verify({ "hub.mode": "subscribe", "hub.verify_token": "token-secreto" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("registra si la firma falló por cabecera faltante o por falta de App Secret", async () => {
    await post(payload([]), null);
    expect(console.warn).toHaveBeenLastCalledWith("[whatsapp] firma inválida", {
      cabeceraPresente: false,
      appSecretConfigurado: true,
      userAgent: null,
    });

    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    await post(payload([]));
    expect(console.warn).toHaveBeenLastCalledWith("[whatsapp] firma inválida", {
      cabeceraPresente: true,
      appSecretConfigurado: false,
      userAgent: null,
    });
  });

  it("registra el user-agent (recortado) para distinguir los smoke tests de un intento real", async () => {
    const send = (userAgent: string) =>
      POST(
        new NextRequest(URL_BASE, {
          method: "POST",
          body: "{}",
          headers: { "x-hub-signature-256": "sha256=falsa", "user-agent": userAgent },
        }),
      );

    await send("finanzas-smoke-test");
    expect(console.warn).toHaveBeenLastCalledWith(
      "[whatsapp] firma inválida",
      expect.objectContaining({ userAgent: "finanzas-smoke-test" }),
    );

    await send("x".repeat(500));
    expect(console.warn).toHaveBeenLastCalledWith(
      "[whatsapp] firma inválida",
      expect.objectContaining({ userAgent: "x".repeat(120) }),
    );
  });

  it("registra cuántos mensajes llegaron y de qué tipo", async () => {
    await post(
      payload([textMessage("wamid.A", "hola"), { ...textMessage("wamid.B", ""), type: "audio" }]),
    );
    expect(console.info).toHaveBeenCalledWith("[whatsapp] webhook recibido", {
      mensajes: 2,
      tipos: ["text", "audio"],
    });
  });
});
