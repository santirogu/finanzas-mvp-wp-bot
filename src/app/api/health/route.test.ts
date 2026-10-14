import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_CREDENTIALS, LATEST_MIGRATION, REQUIRED_ENV } from "@/lib/health";

// La consulta a la base se simula (tiene su prueba de integración); connection() solo marca la
// ruta como dinámica y fuera de Next.js no hace falta.
const mocks = vi.hoisted(() => ({ latestAppliedMigration: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: mocks.connection,
}));
vi.mock("@/db/migrations-status", () => ({
  latestAppliedMigration: mocks.latestAppliedMigration,
}));

const { GET } = await import("./route");

beforeEach(() => {
  for (const name of [...REQUIRED_ENV, ANTHROPIC_CREDENTIALS[0]]) vi.stubEnv(name, "valor");
  mocks.latestAppliedMigration.mockResolvedValue(LATEST_MIGRATION);
  mocks.connection.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("responde 200 y status ok si la app está lista", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("responde 503 sin detalles y deja los problemas en el log", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    mocks.latestAppliedMigration.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logged).toHaveBeenCalledWith("[health] la app no está lista", {
      problemas: [
        "faltan variables de entorno: WHATSAPP_ACCESS_TOKEN",
        "no se pudo consultar la base de datos: connect ECONNREFUSED",
      ],
    });
  });

  it("si la app está lista no escribe en el log de errores", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await GET();
    expect(logged).not.toHaveBeenCalled();
  });
});
