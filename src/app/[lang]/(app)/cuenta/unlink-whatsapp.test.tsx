import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

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

  it("mientras desvincula, el botón lo dice y no deja enviar dos veces; el aviso sale al terminar", async () => {
    let finish!: () => void;
    actions.unlinkWhatsAppAction.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<UnlinkWhatsApp />);
    await user.click(screen.getByRole("button", { name: "Desvincular número" }));
    const busy = await screen.findByRole("button", { name: "Desvinculando…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(actions.unlinkWhatsAppAction).toHaveBeenCalledOnce();
    expect(screen.queryByText("Se desvinculó tu WhatsApp")).toBeNull();

    finish();
    expect(await findToast()).toHaveTextContent("Se desvinculó tu WhatsApp");
  });
});

describe("UnlinkWhatsApp · en inglés", () => {
  it("el botón y el aviso, en inglés", async () => {
    render(<UnlinkWhatsApp />, { english: true });
    await userEvent.click(screen.getByRole("button", { name: "Unlink number" }));
    expect(await findToast()).toHaveTextContent("Your WhatsApp was unlinked");
  });
});
