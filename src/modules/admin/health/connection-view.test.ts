import { describe, expect, it } from "vitest";
import { connectionView } from "./connection-view";

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
