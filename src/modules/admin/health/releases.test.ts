import { beforeEach, describe, expect, it, vi } from "vitest";

// Las releases de /admin/salud: la consulta a GitHub se simula (se prueba en src/lib/releases.test.ts) y
// la caché de Next también; aquí, que pida el rol y que un GitHub caído no rompa la página.
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), fetchReleases: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife }));
vi.mock("@/lib/releases", () => ({ fetchReleases: mocks.fetchReleases }));

const { recentReleases } = await import("./releases");

const release = { tag: "v1.55.0", publishedAt: "2026-10-21T02:02:40Z", commit: "a".repeat(40), url: "https://github.com/x", changes: [] };

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAdmin.mockResolvedValue({ id: "admin" });
});

describe("recentReleases", () => {
  it("las releases de GitHub, guardadas 10 minutos en la caché de Next", async () => {
    mocks.fetchReleases.mockResolvedValue([release]);
    expect(await recentReleases()).toEqual({ ok: true, releases: [release] });
    expect(mocks.cacheLife).toHaveBeenCalledWith({ stale: 300, revalidate: 600, expire: 3600 });
  });

  it("si GitHub no responde, lo dice sin romper la página, y en el log solo va el tipo del error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.fetchReleases.mockRejectedValue(new TypeError("fetch failed"));
    expect(await recentReleases()).toEqual({ ok: false });
    expect(warn).toHaveBeenCalledWith("[salud] no se pudieron consultar las releases de GitHub", "TypeError");
    warn.mockRestore();
  });

  it("sin rol de admin no consulta nada", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(recentReleases()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.fetchReleases).not.toHaveBeenCalled();
  });
});
