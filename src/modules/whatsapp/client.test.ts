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

describe("sendWhatsAppText · dirección de la API", () => {
  it("con WHATSAPP_API_URL local, envía al servidor falso de las pruebas E2E", async () => {
    vi.stubEnv("WHATSAPP_API_URL", "http://localhost:3101/graph/");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendWhatsAppText } = await loadClient();

    await sendWhatsAppText("573001112233", "Hola");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3101/graph/v26.0/1418230944702354/messages");
  });

  it("ignora una WHATSAPP_API_URL que no es local: el token nunca va a otro host", async () => {
    vi.stubEnv("WHATSAPP_API_URL", "https://atacante.example/graph");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendWhatsAppText } = await loadClient();

    await sendWhatsAppText("573001112233", "Hola");
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v26.0/1418230944702354/messages");
  });
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

describe("sendWhatsAppText · sin respuesta", () => {
  it.each([
    [new DOMException("The operation timed out.", "TimeoutError"), "TimeoutError (23)"],
    [new TypeError("fetch failed"), "TypeError"],
  ])("si Meta no responde o no hay red, devuelve el envío fallido sin lanzar: %s", async (thrown, error) => {
    fetchMock.mockRejectedValue(thrown);
    const { sendWhatsAppText } = await loadClient();

    expect(await sendWhatsAppText("573001112233", "Hola")).toEqual({ ok: false, error });
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

describe("checkWhatsAppConnection", () => {
  it("lee el número del bot sin enviar nada, con el token en la cabecera", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ verified_name: "Finanzas MVP", display_phone_number: "+1 555-662-5913", quality_rating: "GREEN" })),
    );
    const { checkWhatsAppConnection } = await loadClient();

    expect(await checkWhatsAppConnection()).toEqual({ status: "ok", detail: "Finanzas MVP · +1 555-662-5913" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v26.0/1418230944702354?fields=verified_name,display_phone_number,quality_rating");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.headers).toEqual({ Authorization: "Bearer EAAtoken" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(["YELLOW", "red"])("con la calidad %s avisa que Meta podría limitar los envíos", async (quality) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ verified_name: "Finanzas MVP", quality_rating: quality })));
    const { checkWhatsAppConnection } = await loadClient();
    expect(await checkWhatsAppConnection()).toEqual({
      status: "ok",
      detail: "Finanzas MVP",
      warning: { kind: "low_quality", quality: quality.toUpperCase() },
    });
  });

  it("sin datos del número (o UNKNOWN), conectó sin detalle ni aviso", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no es json")).mockResolvedValueOnce(new Response(JSON.stringify({ quality_rating: "UNKNOWN" })));
    const { checkWhatsAppConnection } = await loadClient();
    expect(await checkWhatsAppConnection()).toEqual({ status: "ok", detail: null });
    expect(await checkWhatsAppConnection()).toEqual({ status: "ok", detail: null });
  });

  it("si Meta lo rechaza, devuelve el estado y lo que respondió (sin el token)", async () => {
    const body = JSON.stringify({ error: { message: "Error validating access token", code: 190 } });
    fetchMock.mockResolvedValue(new Response(body, { status: 401 }));
    const { checkWhatsAppConnection } = await loadClient();
    const check = await checkWhatsAppConnection();
    expect(check).toEqual({ status: "error", error: `401 ${body}` });
    expect(JSON.stringify(check)).not.toContain("EAAtoken");
  });

  it("de la respuesta de Meta guarda hasta 500 caracteres; si no se puede leer, solo el estado", async () => {
    const long = JSON.stringify({ error: { message: "x".repeat(600), code: 1 } });
    fetchMock.mockResolvedValueOnce(new Response(long, { status: 500 }));
    const unreadable = new Response("", { status: 502 });
    vi.spyOn(unreadable, "text").mockRejectedValue(new TypeError("cuerpo cortado"));
    fetchMock.mockResolvedValueOnce(unreadable);
    const { checkWhatsAppConnection } = await loadClient();

    expect(await checkWhatsAppConnection()).toEqual({ status: "error", error: `500 ${long.slice(0, 500)}` });
    expect(await checkWhatsAppConnection()).toEqual({ status: "error", error: "502 " });
  });

  it("si no responde, devuelve solo el tipo del error", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const { checkWhatsAppConnection } = await loadClient();
    // describeError suma el código heredado de DOMException (23).
    expect(await checkWhatsAppConnection()).toEqual({ status: "error", error: "TimeoutError (23)" });
  });

  it("sin token o sin el id del número, dice cuál falta y no llama a Meta", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const { checkWhatsAppConnection } = await loadClient();
    expect(await checkWhatsAppConnection()).toEqual({ status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN"] });
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", " ");
    expect(await checkWhatsAppConnection()).toEqual({ status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con WHATSAPP_API_URL local (E2E), consulta el servidor falso", async () => {
    vi.stubEnv("WHATSAPP_API_URL", "http://localhost:3101/graph");
    fetchMock.mockResolvedValue(new Response("{}"));
    const { checkWhatsAppConnection } = await loadClient();
    await checkWhatsAppConnection();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/localhost:3101\/graph\/v26\.0\/1418230944702354\?fields=/);
  });
});
