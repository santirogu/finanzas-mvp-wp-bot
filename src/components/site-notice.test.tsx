import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VisibleNotice } from "@/modules/notice/notice";

// El componente de servidor que decide si se dibuja el aviso: lo que lee (el aviso, el idioma, la cookie) se simula.
const mocks = vi.hoisted(() => ({
  notice: null as VisibleNotice | null,
  cookie: undefined as string | undefined,
  getCurrentNotice: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "aviso-cerrado" && mocks.cookie ? { value: mocks.cookie } : undefined) }) }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "es" }));
vi.mock("@/modules/notice/current-notice", () => ({ getCurrentNotice: mocks.getCurrentNotice }));

const { SiteNotice } = await import("./site-notice");

beforeEach(() => {
  mocks.cookie = undefined;
  mocks.connection.mockReset();
  mocks.getCurrentNotice.mockReset().mockImplementation(async () => mocks.notice);
});

const notice: VisibleNotice = { message: "Mantenimiento el sábado de 8 a 9", tone: "important", version: "123" };

describe("SiteNotice", () => {
  it("con un aviso vigente, lo dibuja (en cada pedido: connection) en el idioma de la página", async () => {
    mocks.notice = notice;
    const { container } = render(await SiteNotice({ className: "mx-auto max-w-5xl" }));
    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.getCurrentNotice).toHaveBeenCalledWith("es");
    expect(screen.getByRole("region", { name: "Aviso importante" })).toHaveTextContent("Mantenimiento el sábado de 8 a 9");
    expect(container.firstElementChild).toHaveClass("mx-auto", "max-w-5xl");
  });

  it("sin aviso, nada", async () => {
    mocks.notice = null;
    expect(await SiteNotice({})).toBeNull();
  });

  it("si la persona cerró esa versión, nada; si es otra, sí", async () => {
    mocks.notice = notice;
    mocks.cookie = "123";
    expect(await SiteNotice({})).toBeNull();
    mocks.cookie = "122";
    expect(await SiteNotice({})).not.toBeNull();
  });
});
