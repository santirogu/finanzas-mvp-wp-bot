import { screen, within } from "@testing-library/react";
import { findToast, renderWithToaster as render } from "../../../../../../test/toaster";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// La Server Action se simula: aquí se prueba qué se muestra y qué se envía.
const actions = vi.hoisted(() => ({
  resendRepliesAction: vi.fn(),
  pauseClaudeAction: vi.fn(),
  resumeClaudeAction: vi.fn(),
  changeAiLimitsAction: vi.fn(),
  changeMonthlyLimitAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { ResendReplies } = await import("./resend-replies");

beforeEach(() => {
  actions.resendRepliesAction.mockReset();
});

describe("ResendReplies", () => {
  it("sin respuestas pendientes no muestra nada", () => {
    const { container } = render(<ResendReplies pending={0} windowHours={24} />);
    expect(container).toHaveTextContent("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("dice cuántas no salieron y, al reenviar, pide el código y explica qué pasa", async () => {
    actions.resendRepliesAction.mockResolvedValue({ message: "Se reenviaron 2 respuestas." });
    const { rerender } = render(<ResendReplies pending={2} windowHours={24} />);
    expect(screen.getByText("2 respuestas no salieron en las últimas 24 horas.")).toHaveClass("text-danger");
    await userEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    const dialog = screen.getByRole("dialog", { name: "¿Reenviar 2 respuestas?" });
    expect(dialog).toHaveAccessibleDescription(/no la ves ni se registra nada otra vez.*Solo las de las últimas 24 horas/);
    await userEvent.type(within(dialog).getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reenviar" }));

    expect((actions.resendRepliesAction.mock.calls[0][1] as FormData).get("code")).toBe("123456");
    // La página se vuelve a dibujar con 0 pendientes: el aviso sigue a la vista (verde).
    rerender(<ResendReplies pending={0} windowHours={24} />);
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se reenviaron 2 respuestas.");
    expect(toast).toHaveAttribute("data-tone", "success");
    // El botón desaparece: el foco va al aviso (si no, el teclado quedaría en ninguna parte).
    expect(toast).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Reenviar" })).toBeNull();
  });

  it("con una sola, en singular (también la ventana)", async () => {
    render(<ResendReplies pending={1} windowHours={24} />);
    expect(screen.getByText("1 respuesta no salió en las últimas 24 horas.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    expect(screen.getByRole("dialog", { name: "¿Reenviar 1 respuesta?" })).toBeInTheDocument();
  });
});

describe("ResendReplies en inglés", () => {
  it("cuántas no salieron y la ventana para reenviarlas", async () => {
    render(<ResendReplies pending={2} windowHours={24} />, { english: true });
    expect(screen.getByText("2 replies didn't go out in the last 24 hours.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resend" }));
    const box = screen.getByRole("dialog", { name: "Resend 2 replies?" });
    expect(box).toHaveAccessibleDescription(expect.stringContaining("Only those from the last 24 hours"));
    expect(within(box).getByLabelText("Google Authenticator code")).toBeRequired();
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("una sola, en singular", () => {
    render(<ResendReplies pending={1} windowHours={24} />, { english: true });
    expect(screen.getByText("1 reply didn't go out in the last 24 hours.")).toBeInTheDocument();
  });
});
