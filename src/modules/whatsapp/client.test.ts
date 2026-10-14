import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// fetch simulado: ninguna prueba envía mensajes reales por WhatsApp.
const fetchMock = vi.fn();

async function loadClient() {
  // La versión de la Graph API se lee al cargar el módulo: se recarga en cada prueba.
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "EAAtoken\n");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1418230944702354");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendWhatsAppText", () => {
  it("envía el texto a la Graph API v26.0 con el token sin saltos de línea", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendWhatsAppText } = await loadClient();

    expect(await sendWhatsAppText("573001112233", "Hola")).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v26.0/1418230944702354/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer EAAtoken",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "573001112233",
      type: "text",
      text: { preview_url: false, body: "Hola" },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("permite cambiar la versión de la Graph API por entorno", async () => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v27.0");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendWhatsAppText } = await loadClient();

    await sendWhatsAppText("573001112233", "Hola");

    expect(fetchMock.mock.calls[0][0]).toContain("/v27.0/");
  });

  it("devuelve el error de Meta (p. ej. número no autorizado) sin lanzar", async () => {
    const metaError = JSON.stringify({
      error: { code: 131030, message: "Recipient not in allowed list" },
    });
    fetchMock.mockResolvedValue(new Response(metaError, { status: 400 }));
    const { sendWhatsAppText } = await loadClient();

    const result = await sendWhatsAppText("573009999999", "Hola");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^400 .*131030/);
  });

  it("recorta errores muy largos a 500 caracteres", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(5000), { status: 500 }));
    const { sendWhatsAppText } = await loadClient();

    const result = await sendWhatsAppText("573001112233", "Hola");

    expect(!result.ok && result.error).toHaveLength("500 ".length + 500);
  });

  it("sin credenciales de Meta solo imprime el mensaje (modo desarrollo)", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendWhatsAppText, isWhatsAppConfigured } = await loadClient();

    expect(isWhatsAppConfigured()).toBe(false);
    expect(await sendWhatsAppText("573001112233", "Hola")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("573001112233"));
  });
});

describe("sendWhatsAppText · errores sin cuerpo", () => {
  it("si no se puede leer el cuerpo del error, informa solo el estado", async () => {
    const response = new Response(null, { status: 503 });
    vi.spyOn(response, "text").mockRejectedValue(new Error("stream cerrado"));
    fetchMock.mockResolvedValue(response);
    const { sendWhatsAppText } = await loadClient();

    expect(await sendWhatsAppText("573001112233", "Hola")).toEqual({ ok: false, error: "503 " });
  });
});
