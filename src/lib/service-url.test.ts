import { afterEach, describe, expect, it, vi } from "vitest";
import { serviceUrl } from "./service-url";

const DEFAULT = "https://api.servicio.com";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("serviceUrl", () => {
  it("sin la variable usa la dirección oficial, sin avisar nada", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("SERVICIO_URL", undefined);
    expect(serviceUrl("SERVICIO_URL", DEFAULT)).toBe(DEFAULT);
    vi.stubEnv("SERVICIO_URL", "   ");
    expect(serviceUrl("SERVICIO_URL", DEFAULT)).toBe(DEFAULT);
    expect(warn).not.toHaveBeenCalled();
  });

  it("quita todas las barras del final", () => {
    vi.stubEnv("SERVICIO_URL", "http://localhost:3101/graph///");
    expect(serviceUrl("SERVICIO_URL", DEFAULT)).toBe("http://localhost:3101/graph");
  });

  it.each(["http://localhost:3101/graph", "https://localhost/x", "http://127.0.0.1:9000", "http://[::1]:3101"])(
    "acepta un servidor local (%s), sin la barra final",
    (url) => {
      vi.stubEnv("SERVICIO_URL", `${url}/`);
      expect(serviceUrl("SERVICIO_URL", DEFAULT)).toBe(url);
    },
  );

  it.each([
    "https://atacante.example",
    "http://localhost.atacante.example",
    "http://127.0.0.2",
    "https://evil.com/?x=localhost",
    "no-es-una-url",
  ])("ignora %s y avisa (con cada pedido viaja un token)", (url) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("SERVICIO_URL", url);
    expect(serviceUrl("SERVICIO_URL", DEFAULT)).toBe(DEFAULT);
    expect(warn).toHaveBeenCalledWith(
      "[config] SERVICIO_URL ignorada: solo se permite un servidor local (localhost)",
    );
  });
});
