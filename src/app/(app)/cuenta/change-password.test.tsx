import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangePasswordState } from "@/modules/account/actions";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: ChangePasswordState, data: FormData) => Promise<ChangePasswordState>>());
vi.mock("@/modules/account/actions", () => ({ changePasswordAction: action }));

const { ChangePassword } = await import("./change-password");

const section = () => within(screen.getByRole("region", { name: "Seguridad" }));
const openButton = () => section().getByRole("button", { name: "Cambiar contraseña" });
const current = () => section().getByLabelText("Contraseña actual");
const next = () => section().getByLabelText("Contraseña nueva");
const repeat = () => section().getByLabelText("Repite la contraseña nueva");
const save = () => section().getByRole("button", { name: /Guardar contraseña|Guardando/ });

async function fill(user: ReturnType<typeof userEvent.setup>, values = { current: "clave-vieja-1", next: "clave-nueva-2", repeat: "clave-nueva-2" }) {
  await user.type(current(), values.current);
  await user.type(next(), values.next);
  await user.type(repeat(), values.repeat);
}

beforeEach(() => {
  action.mockReset();
});

describe("ChangePassword", () => {
  it("cerrado, solo el botón (que dice qué controla)", () => {
    render(<ChangePassword needsCode={false} />);
    expect(section().getByText("Al cambiarla se cierran tus otras sesiones.")).toBeVisible();
    expect(openButton()).toHaveAttribute("aria-expanded", "false");
    expect(section().queryByLabelText("Contraseña actual")).toBeNull();
  });

  it("al abrirlo, los tres campos (el primero con el foco) y sin código para quien no es admin", async () => {
    const user = userEvent.setup();
    render(<ChangePassword needsCode={false} />);
    const controls = openButton().getAttribute("aria-controls");
    await user.click(openButton());
    expect(current()).toHaveFocus();
    expect(document.getElementById(controls!)).toContainElement(current());
    expect(current()).toHaveAttribute("autocomplete", "current-password");
    for (const field of [next(), repeat()]) {
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveAttribute("autocomplete", "new-password");
      expect(field).toHaveAttribute("minlength", "8");
      expect(field).toHaveAttribute("maxlength", "128");
    }
    expect(next()).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(section().queryByLabelText("Código de Google Authenticator")).toBeNull();
  });

  it("un admin con la verificación también escribe su código", async () => {
    const user = userEvent.setup();
    render(<ChangePassword needsCode />);
    await user.click(openButton());
    const code = section().getByLabelText("Código de Google Authenticator");
    expect(code).toBeRequired();
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("Cancelar lo cierra sin enviar y el foco vuelve al botón", async () => {
    const user = userEvent.setup();
    render(<ChangePassword needsCode={false} />);
    await user.click(openButton());
    await user.click(section().getByRole("button", { name: "Cancelar" }));
    expect(section().queryByLabelText("Contraseña actual")).toBeNull();
    expect(openButton()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("con éxito envía los campos, se cierra y avisa en verde", async () => {
    action.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ChangePassword needsCode={false} />);
    await user.click(openButton());
    await fill(user);
    await user.click(save());
    expect(Object.fromEntries(action.mock.calls[0][1])).toEqual({ current: "clave-vieja-1", next: "clave-nueva-2", repeat: "clave-nueva-2" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se cambió tu contraseña. Cerramos tus otras sesiones.");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(section().queryByLabelText("Contraseña actual")).toBeNull();
  });

  it("los errores del servidor van debajo de su campo, y los generales en un aviso", async () => {
    action.mockResolvedValueOnce({ fieldErrors: { current: "Contraseña incorrecta." } });
    const user = userEvent.setup();
    render(<ChangePassword needsCode={false} />);
    await user.click(openButton());
    await fill(user);
    await user.click(save());
    expect(await section().findByText("Contraseña incorrecta.")).toBeVisible();
    expect(current()).toHaveAttribute("aria-invalid", "true");
    expect(current()).toHaveAccessibleDescription("Contraseña incorrecta.");

    // React vacía el formulario después de cada envío: se vuelve a escribir.
    action.mockResolvedValueOnce({ error: "Por demasiados intentos, tu cuenta quedó bloqueada." });
    await fill(user);
    await user.click(save());
    expect(await section().findByRole("alert")).toHaveTextContent("Por demasiados intentos");
  });

  // El de "al menos 8 caracteres" lo revisa la E2E: jsdom no implementa minLength.
  it("antes de enviar, los errores en español y sin llamar al servidor", async () => {
    const user = userEvent.setup();
    render(<ChangePassword needsCode />);
    await user.click(openButton());
    await user.click(save());
    expect(await section().findByText("Escribe tu contraseña actual.")).toBeVisible();
    expect(section().getByText("Escribe la contraseña nueva.")).toBeVisible();
    expect(section().getByText("Repite la contraseña nueva.")).toBeVisible();
    expect(section().getByText("Escribe el código de 6 dígitos de Google Authenticator.")).toBeVisible();
    expect(action).not.toHaveBeenCalled();
  });
});
