import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findToast, renderWithToaster as render, toasts } from "../../../../../../test/toaster";
import type { SignupSettingsProps } from "./signup-settings";

// Las Server Actions se simulan: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo responde a cada
// resultado). Lo que hacen de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({
  changeSignupModeAction: vi.fn(),
  addSignupInviteAction: vi.fn(),
  removeSignupInviteAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { SignupSettings } = await import("./signup-settings");

// jsdom no tiene showModal ni close: lo mínimo para abrir y cerrar la ventana.
beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const props = (overrides: Partial<SignupSettingsProps> = {}): SignupSettingsProps => ({ mode: "open", invites: [], lastChange: null, ...overrides });
const section = () => within(screen.getByRole("region", { name: "Registros" }));
const dialog = () => within(screen.getByRole("dialog"));
const emailField = () => section().getByLabelText("Correo");

describe("SignupSettings · quién puede crear una cuenta", () => {
  it("abiertos y sin cambios: lo dice, sin invitados", () => {
    render(<SignupSettings {...props()} />);
    expect(section().getByText("Abiertos")).toBeInTheDocument();
    expect(section().getByText("Cualquiera puede crear una cuenta.")).toBeInTheDocument();
    expect(section().getByText("Sin cambios: abiertos, como siempre.")).toBeInTheDocument();
    expect(section().getByText(/^Sirven cuando los registros son solo con invitación\./)).toBeInTheDocument();
    expect(section().getByText("Todavía no hay invitados.")).toBeInTheDocument();
  });

  it("solo con invitación: los invitados, pendientes o con su cuenta creada, y quién lo cambió", () => {
    render(
      <SignupSettings
        {...props({
          mode: "invite",
          lastChange: "Ana Admin · 22 de oct",
          invites: [
            { email: "beto@test.local", date: "21 de oct. de 2026", used: false },
            { email: "carla@test.local", date: "22 de oct. de 2026", used: true },
          ],
        })}
      />,
    );
    expect(section().getByText("Solo con invitación")).toBeInTheDocument();
    expect(section().getByText(/^Solo estos correos pueden crear una cuenta\./)).toBeInTheDocument();
    expect(section().getByText("Último cambio: Ana Admin · 22 de oct")).toBeInTheDocument();
    const rows = within(section().getByRole("list", { name: "Correos invitados" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("beto@test.localPendiente · invitado el 21 de oct. de 2026");
    expect(rows[1]).toHaveTextContent("carla@test.localCreó su cuenta el 22 de oct. de 2026");
    expect(within(rows[1]).getByRole("button", { name: "Quitar la invitación de carla@test.local" })).toBeInTheDocument();
  });

  it("cambiar abre las tres opciones con la de ahora marcada; sin elegir otra no se puede enviar", async () => {
    render(<SignupSettings {...props({ mode: "closed" })} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar quién puede crear una cuenta" }));
    expect(screen.getByRole("dialog", { name: "Cambiar quién puede crear una cuenta" })).toHaveAccessibleDescription(
      "Aplica de inmediato en la página de registro. Pide el código de Google Authenticator.",
    );
    const radios = dialog().getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["open", "invite", "closed"]);
    expect(dialog().getByRole("radio", { name: /^Cerrados \(los de ahora\)/ })).toBeChecked();
    expect(dialog().getByRole("button", { name: "Cambiar" })).toBeDisabled();
  });

  it("elegir otro, con el código, envía la acción y el aviso recibe el foco", async () => {
    actions.changeSignupModeAction.mockResolvedValue({ message: "Ahora solo se puede crear una cuenta con invitación." });
    render(<SignupSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar quién puede crear una cuenta" }));
    await userEvent.click(dialog().getByRole("radio", { name: /^Solo con invitación/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar" }));

    const sent = actions.changeSignupModeAction.mock.calls[0][1] as FormData;
    expect([sent.get("mode"), sent.get("code")]).toEqual(["invite", "123456"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await findToast();
    expect(toast).toHaveTextContent("Ahora solo se puede crear una cuenta con invitación.");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveFocus();
  });

  it("un código equivocado va en su campo, la elección sigue y la ventana no se cierra", async () => {
    actions.changeSignupModeAction.mockResolvedValue({ error: "El código no es correcto.", field: "code" });
    render(<SignupSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar quién puede crear una cuenta" }));
    await userEvent.click(dialog().getByRole("radio", { name: /^Cerrados/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "111111");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar" }));
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription("El código no es correcto.");
    expect(dialog().getByRole("radio", { name: /^Cerrados/ })).toBeChecked();
    expect(toasts()).toHaveLength(0);
  });

  it("si el servidor rechaza la opción, lo dice debajo de las opciones", async () => {
    actions.changeSignupModeAction.mockResolvedValue({ error: "Los registros ya están así: elige otra opción.", field: "mode" });
    render(<SignupSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar quién puede crear una cuenta" }));
    await userEvent.click(dialog().getByRole("radio", { name: /^Cerrados/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar" }));
    expect(dialog().getByRole("group", { name: "Registros" })).toHaveAccessibleDescription("Los registros ya están así: elige otra opción.");
  });
});

describe("SignupSettings · invitados", () => {
  it("invita sin código: envía el correo, avisa sin quitarle el foco al formulario y vacía el campo", async () => {
    actions.addSignupInviteAction.mockResolvedValue({ message: "Se invitó a beto@test.local" });
    render(<SignupSettings {...props()} />);
    await userEvent.type(emailField(), "beto@test.local{Enter}");
    expect((actions.addSignupInviteAction.mock.calls[0][1] as FormData).get("email")).toBe("beto@test.local");
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se invitó a beto@test.local");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).not.toHaveFocus();
    expect(emailField()).toHaveValue("");
    expect(emailField()).toHaveFocus();
  });

  it("un error del servidor va debajo del campo y lo escrito sigue ahí", async () => {
    actions.addSignupInviteAction.mockResolvedValue({ error: "Ese correo ya está invitado.", field: "email" });
    render(<SignupSettings {...props()} />);
    await userEvent.type(emailField(), "beto@test.local");
    await userEvent.click(section().getByRole("button", { name: "Invitar" }));
    expect(emailField()).toHaveAccessibleDescription("Ese correo ya está invitado.");
    expect(emailField()).toHaveAttribute("aria-invalid", "true");
    expect(emailField()).toHaveValue("beto@test.local");
    expect(toasts()).toHaveLength(0);
  });

  it("vacío o mal escrito, lo dice en español sin enviar nada", async () => {
    render(<SignupSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Invitar" }));
    expect(emailField()).toHaveAccessibleDescription("Escribe el correo.");
    await userEvent.type(emailField(), "beto");
    await userEvent.click(section().getByRole("button", { name: "Invitar" }));
    expect(emailField()).toHaveAccessibleDescription("Revisa el correo: debe verse como nombre@correo.com.");
    expect(actions.addSignupInviteAction).not.toHaveBeenCalled();
  });

  it("quitar envía ese correo y el aviso (en rojo) recibe el foco; un error se ve junto al botón", async () => {
    actions.removeSignupInviteAction
      .mockResolvedValueOnce({ error: "Esa invitación ya no existe." })
      .mockResolvedValueOnce({ message: "Se quitó la invitación de beto@test.local" });
    render(<SignupSettings {...props({ invites: [{ email: "beto@test.local", date: "21 de oct. de 2026", used: false }] })} />);
    const remove = section().getByRole("button", { name: "Quitar la invitación de beto@test.local" });
    await userEvent.click(remove);
    expect(section().getByRole("alert")).toHaveTextContent("Esa invitación ya no existe.");

    await userEvent.click(remove);
    expect((actions.removeSignupInviteAction.mock.calls[1][1] as FormData).get("email")).toBe("beto@test.local");
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se quitó la invitación de beto@test.local");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
  });
});

describe("SignupSettings en inglés", () => {
  it("los textos, las opciones y los errores de los campos", async () => {
    render(<SignupSettings {...props({ mode: "invite", invites: [{ email: "beto@test.local", date: "Oct 21, 2026", used: false }] })} />, {
      english: true,
    });
    const card = within(screen.getByRole("region", { name: "Sign-ups" }));
    expect(card.getByText("Invitation only")).toBeInTheDocument();
    expect(card.getByText("Pending · invited on Oct 21, 2026")).toBeInTheDocument();
    expect(card.getByText("No changes: open, as always.")).toBeInTheDocument();
    await userEvent.click(card.getByRole("button", { name: "Invite" }));
    expect(card.getByLabelText("Email")).toHaveAccessibleDescription("Enter the email.");
    await userEvent.click(card.getByRole("button", { name: "Change who can create an account" }));
    expect(dialog().getByRole("radio", { name: /^Invitation only \(current\)/ })).toBeChecked();
  });
});
