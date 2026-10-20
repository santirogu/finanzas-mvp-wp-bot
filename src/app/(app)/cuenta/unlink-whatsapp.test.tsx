import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

// La Server Action se simula: aquí se prueba qué ve la persona al desvincular su número.
const actions = vi.hoisted(() => ({ unlinkWhatsAppAction: vi.fn() }));
vi.mock("@/modules/whatsapp/actions", () => actions);

const { UnlinkWhatsApp } = await import("./unlink-whatsapp");

beforeEach(() => {
  actions.unlinkWhatsAppAction.mockReset();
});

describe("UnlinkWhatsApp", () => {
  it("desvincula y avisa en rojo, con el foco en el aviso (el botón desaparece al refrescar)", async () => {
    actions.unlinkWhatsAppAction.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UnlinkWhatsApp />);
    await user.click(screen.getByRole("button", { name: "Desvincular número" }));

    const toast = await findToast();
    expect(toast).toHaveTextContent("Se desvinculó tu WhatsApp");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
    expect(actions.unlinkWhatsAppAction).toHaveBeenCalledOnce();
  });

  it("el aviso sale recién cuando terminó de desvincular", async () => {
    let finish!: () => void;
    actions.unlinkWhatsAppAction.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<UnlinkWhatsApp />);
    await user.click(screen.getByRole("button", { name: "Desvincular número" }));
    expect(screen.queryByText("Se desvinculó tu WhatsApp")).toBeNull();

    finish();
    expect(await findToast()).toHaveTextContent("Se desvinculó tu WhatsApp");
  });
});
