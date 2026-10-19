import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsAppHint es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const mocks = vi.hoisted(() => ({ link: null as { phone: string } | null, getLinkForUser: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/modules/whatsapp/link", () => ({ getLinkForUser: mocks.getLinkForUser }));

const { WHATSAPP_SECTION_HREF, WhatsAppHint } = await import("./whatsapp-hint");

beforeEach(() => {
  mocks.getLinkForUser.mockReset().mockImplementation(async () => mocks.link);
});

describe("WhatsAppHint", () => {
  it("sin WhatsApp vinculado, un aviso que lleva a la tarjeta de Mi cuenta", async () => {
    mocks.link = null;
    render(await WhatsAppHint());
    const hint = screen.getByRole("link", { name: /^Registra tus gastos por WhatsApp/ });
    expect(WHATSAPP_SECTION_HREF).toBe("/cuenta#whatsapp");
    expect(hint).toHaveAttribute("href", "/cuenta#whatsapp");
    expect(hint).toHaveTextContent("Conecta tu número en Mi cuenta.");
    expect(hint).toHaveTextContent("Conectar");
    // El ícono es decorativo.
    expect(hint.querySelector("svg")).toHaveAttribute("aria-hidden");
    expect(mocks.getLinkForUser).toHaveBeenCalledWith("u1");
  });

  it("ya vinculado, no muestra nada", async () => {
    mocks.link = { phone: "573001112233" };
    const { container } = render(<>{await WhatsAppHint()}</>);
    expect(container).toBeEmptyDOMElement();
  });
});
