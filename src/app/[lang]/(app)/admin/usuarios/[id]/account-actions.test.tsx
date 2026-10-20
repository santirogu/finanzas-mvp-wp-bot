import { screen, within } from "@testing-library/react";
import { findToast, renderWithToaster as render } from "../../../../../../../test/toaster";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionTarget } from "./account-actions";

// Las Server Actions se simulan: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo
// responde a cada resultado). Lo que hacen de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({
  unlockLoginAction: vi.fn(),
  revokeSessionsAction: vi.fn(),
  unlinkWhatsAppByAdminAction: vi.fn(),
  suspendAccountAction: vi.fn(),
  reactivateAccountAction: vi.fn(),
  deleteAccountByAdminAction: vi.fn(),
  grantAdminAction: vi.fn(),
  revokeAdminAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { AccountActions, RevokeAdminActions } = await import("./account-actions");

// jsdom no tiene showModal ni close: lo mínimo para abrir y cerrar la ventana.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const target = (overrides: Partial<ActionTarget> = {}): ActionTarget => ({
  id: "cuenta-1",
  name: "Beto Ruiz",
  email: "beto@correo.com",
  lockedUntil: "3:15 p. m.",
  openSessions: 2,
  phone: "+57 300 111 2233",
  suspendedSince: null,
  suspensionReason: null,
  ...overrides,
});

const actionsSection = () => within(screen.getByRole("region", { name: "Acciones" }));
const dialog = () => screen.getByRole("dialog");
const codeField = () => within(dialog()).getByLabelText("Código de Google Authenticator");

describe("AccountActions", () => {
  it("muestra solo las acciones que aplican, cada una con su detalle", () => {
    render(<AccountActions target={target()} />);
    const rows = actionsSection().getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Desbloquear el inicio de sesión",
      "Cerrar todas sus sesiones",
      "Desvincular su WhatsApp",
    ]);
    expect(rows[0]).toHaveTextContent("Bloqueado por contraseñas equivocadas hasta las 3:15 p. m.");
    expect(rows[1]).toHaveTextContent("2 sesiones abiertas. Su WhatsApp sigue funcionando.");
    expect(rows[2]).toHaveTextContent("+57 300 111 2233");
    expect(actionsSection().getByText("Cada una pide el código de Google Authenticator.")).toBeInTheDocument();
  });

  it("sin bloqueo, sesiones ni WhatsApp lo dice; eliminar siempre está, en la zona de peligro", () => {
    render(<AccountActions target={target({ lockedUntil: null, openSessions: 0, phone: null })} />);
    expect(actionsSection().queryAllByRole("button")).toEqual([]);
    expect(actionsSection().getByText("No tiene nada que desbloquear, cerrar ni desvincular.")).toBeInTheDocument();
    const danger = within(screen.getByRole("region", { name: "Zona de peligro" }));
    expect(danger.getByRole("button", { name: "Eliminar cuenta" })).toBeInTheDocument();
  });

  it("una sola sesión va en singular", () => {
    render(<AccountActions target={target({ openSessions: 1 })} />);
    expect(actionsSection().getByText("1 sesión abierta. Su WhatsApp sigue funcionando.")).toBeInTheDocument();
  });

  it.each([
    ["Desbloquear", "¿Desbloquear el inicio de sesión de Beto Ruiz?", "Podrá volver a intentar con su contraseña"],
    ["Cerrar sesiones", "¿Cerrar todas las sesiones de Beto Ruiz?", "Tendrá que volver a iniciar sesión en 2 dispositivos"],
    ["Desvincular", "¿Desvincular el WhatsApp de Beto Ruiz?", "El bot dejará de registrar lo que escriba desde +57 300 111 2233"],
  ])("'%s' abre su ventana, con lo que va a pasar y el código", async (button, title, description) => {
    render(<AccountActions target={target()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(actionsSection().getByRole("button", { name: button }));
    expect(dialog()).toHaveAccessibleName(title);
    expect(dialog()).toHaveAccessibleDescription(expect.stringContaining(description));
    expect(codeField()).toHaveAttribute("inputmode", "numeric");
    expect(codeField()).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeField()).toBeRequired();
  });

  it("'Cancelar' cierra la ventana sin enviar nada", async () => {
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Desbloquear" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.unlockLoginAction).not.toHaveBeenCalled();
  });

  it("envía la cuenta y el código; si el código está mal, lo marca y deja la ventana abierta", async () => {
    actions.revokeSessionsAction.mockResolvedValue({ error: "El código no es correcto. Te quedan 4 intentos.", field: "code" });
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Cerrar sesiones" }));
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cerrar sesiones" }));

    const sent = actions.revokeSessionsAction.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(sent)).toEqual({ userId: "cuenta-1", code: "123456" });
    expect(await within(dialog()).findByText("El código no es correcto. Te quedan 4 intentos.")).toBeInTheDocument();
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(codeField()).toHaveAccessibleDescription("El código no es correcto. Te quedan 4 intentos.");
  });

  it("otros errores van en una alerta", async () => {
    actions.unlinkWhatsAppByAdminAction.mockResolvedValue({ error: "La cuenta ya no tiene un WhatsApp vinculado." });
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Desvincular" }));
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Desvincular" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("La cuenta ya no tiene un WhatsApp vinculado.");
    expect(codeField()).not.toHaveAttribute("aria-invalid");
  });

  it("con éxito, cierra la ventana y avisa qué pasó (verde al desbloquear); la ventana siguiente empieza vacía", async () => {
    actions.unlockLoginAction.mockResolvedValue({ message: "Se desbloqueó el inicio de sesión de Beto Ruiz." });
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Desbloquear" }));
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Desbloquear" }));

    const toast = await findToast();
    expect(toast).toHaveTextContent("Se desbloqueó el inicio de sesión de Beto Ruiz.");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(screen.queryByRole("dialog")).toBeNull();
    // El botón que abrió la ventana ya no existe (la cuenta se desbloqueó): el foco va al aviso.
    expect(toast).toHaveFocus();

    await userEvent.click(actionsSection().getByRole("button", { name: "Desvincular" }));
    // La ventana nueva empieza vacía.
    expect(codeField()).toHaveValue("");
  });

  it.each([
    ["Desbloquear", "unlockLoginAction", "Desbloqueando…"],
    ["Cerrar sesiones", "revokeSessionsAction", "Cerrando…"],
    ["Desvincular", "unlinkWhatsAppByAdminAction", "Desvinculando…"],
  ] as const)("mientras '%s' se envía, el botón lo dice y no deja enviar dos veces", async (button, action, pending) => {
    let finish: (state: object) => void = () => {};
    actions[action].mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: button }));
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: button }));

    const busy = await within(dialog()).findByRole("button", { name: pending });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(actions[action]).toHaveBeenCalledTimes(1);
    // A la cuenta que se está viendo, no a otra.
    expect(Object.fromEntries(actions[action].mock.calls[0][1] as FormData)).toEqual({ userId: "cuenta-1", code: "123456" });
    finish({ error: "El código no es correcto. Te quedan 4 intentos.", field: "code" });
    expect(await within(dialog()).findByRole("button", { name: button })).toBeEnabled();
  });

  it("al cerrar la ventana con Esc (evento close), se va sin enviar", async () => {
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Desvincular" }));
    (dialog() as HTMLDialogElement).close();
    expect(await screen.findByRole("region", { name: "Acciones" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.unlinkWhatsAppByAdminAction).not.toHaveBeenCalled();
  });

  describe("suspender y reactivar", () => {
    const danger = () => within(screen.getByRole("region", { name: "Zona de peligro" }));

    it("una cuenta activa se suspende desde la zona de peligro, antes de eliminar", () => {
      render(<AccountActions target={target()} />);
      expect(danger().getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent)).toEqual([
        "Suspender la cuenta",
        "Eliminar la cuenta",
      ]);
      expect(danger().getAllByRole("listitem")[0]).toHaveTextContent(
        "No podrá entrar ni usar el bot hasta que la reactives. Sus datos se conservan.",
      );
      expect(actionsSection().queryByRole("button", { name: "Reactivar" })).toBeNull();
    });

    it("la ventana de suspender explica qué pasa y pide un motivo opcional, que solo ve el admin", async () => {
      actions.suspendAccountAction.mockResolvedValue({ message: "Se suspendió la cuenta de Beto Ruiz." });
      render(<AccountActions target={target()} />);
      await userEvent.click(danger().getByRole("button", { name: "Suspender" }));
      expect(dialog()).toHaveAccessibleName("¿Suspender la cuenta de Beto Ruiz?");
      expect(dialog()).toHaveAccessibleDescription(
        "No podrá entrar a la web ni registrar movimientos por WhatsApp hasta que la reactives. Se cierran sus sesiones y sus datos se conservan. Al intentar entrar verá que su cuenta está suspendida, sin el motivo.",
      );
      const reason = within(dialog()).getByLabelText(/Motivo/);
      expect(reason).toHaveAccessibleName("Motivo (opcional, solo lo ves tú)");
      expect(reason).not.toBeRequired();
      expect(reason).toHaveAttribute("maxlength", "300");

      await userEvent.type(reason, "Usa la cuenta de otra persona");
      await userEvent.type(codeField(), "123456");
      await userEvent.click(within(dialog()).getByRole("button", { name: "Suspender" }));
      const sent = actions.suspendAccountAction.mock.calls[0][1] as FormData;
      expect(Object.fromEntries(sent)).toEqual({ userId: "cuenta-1", reason: "Usa la cuenta de otra persona", code: "123456" });
      const toast = await findToast();
      expect(toast).toHaveTextContent("Se suspendió la cuenta de Beto Ruiz.");
      expect(toast).toHaveAttribute("data-tone", "removal");
    });

    it("una cuenta suspendida se reactiva desde Acciones (con desde cuándo y el motivo) y ya no se puede suspender", async () => {
      actions.reactivateAccountAction.mockResolvedValue({ message: "Se reactivó la cuenta de Beto Ruiz." });
      render(
        <AccountActions
          target={target({ suspendedSince: "15 de oct de 2026, 3:00 p. m.", suspensionReason: "Spam", openSessions: 0, lockedUntil: null })}
        />,
      );
      const row = actionsSection().getAllByRole("listitem")[0];
      const [title, description] = row.querySelectorAll("p");
      expect(title).toHaveTextContent("Reactivar la cuenta");
      expect(description.textContent).toBe("Suspendida desde el 15 de oct de 2026, 3:00 p. m. Motivo: Spam");
      expect(danger().queryByRole("button", { name: "Suspender" })).toBeNull();
      expect(danger().getByRole("button", { name: "Eliminar cuenta" })).toBeInTheDocument();

      await userEvent.click(within(row).getByRole("button", { name: "Reactivar" }));
      expect(dialog()).toHaveAccessibleName("¿Reactivar la cuenta de Beto Ruiz?");
      expect(dialog()).toHaveAccessibleDescription("Podrá volver a entrar y a usar el bot de WhatsApp.");
      expect(within(dialog()).queryByLabelText(/Motivo/)).toBeNull();
      await userEvent.type(codeField(), "123456");
      await userEvent.click(within(dialog()).getByRole("button", { name: "Reactivar" }));
      expect(Object.fromEntries(actions.reactivateAccountAction.mock.calls[0][1] as FormData)).toEqual({ userId: "cuenta-1", code: "123456" });
      const toast = await findToast();
      expect(toast).toHaveTextContent("Se reactivó la cuenta de Beto Ruiz.");
      expect(toast).toHaveAttribute("data-tone", "success");
    });

    it("suspendida sin motivo, no lo menciona", () => {
      render(<AccountActions target={target({ suspendedSince: "15 de oct de 2026, 3:00 p. m." })} />);
      const description = actionsSection().getAllByRole("listitem")[0].querySelectorAll("p")[1];
      expect(description.textContent).toBe("Suspendida desde el 15 de oct de 2026, 3:00 p. m.");
    });

    it.each([
      ["Suspender", "suspendAccountAction", "Suspendiendo…", {}],
      ["Reactivar", "reactivateAccountAction", "Reactivando…", { suspendedSince: "hoy" }],
    ] as const)("mientras '%s' se envía, lo dice", async (button, action, pending, overrides) => {
      let finish: (state: object) => void = () => {};
      actions[action].mockReturnValue(new Promise((resolve) => (finish = resolve)));
      render(<AccountActions target={target(overrides)} />);
      await userEvent.click(screen.getAllByRole("button", { name: button })[0]);
      await userEvent.type(codeField(), "123456");
      await userEvent.click(within(dialog()).getByRole("button", { name: button }));
      expect(await within(dialog()).findByRole("button", { name: pending })).toBeDisabled();
      finish({ error: "Esta cuenta ya no existe." });
      expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Esta cuenta ya no existe.");
    });
  });

  describe("eliminar", () => {
    async function openDelete() {
      render(<AccountActions target={target()} />);
      await userEvent.click(screen.getByRole("button", { name: "Eliminar cuenta" }));
      return within(dialog());
    }

    it("explica qué se borra y pide escribir el correo y el código", async () => {
      const box = await openDelete();
      expect(dialog()).toHaveAccessibleName("¿Eliminar la cuenta de Beto Ruiz?");
      expect(dialog()).toHaveAccessibleDescription(
        "Se borran su cuenta, sus movimientos, sus categorías, su WhatsApp y su historial. No se puede deshacer. En el historial queda solo “se eliminó una cuenta”.",
      );
      expect(box.getByLabelText(/Escribe su correo/)).toHaveAttribute("type", "email");
      expect(codeField()).toBeInTheDocument();
    });

    it("el botón solo funciona con el correo exacto (sin importar mayúsculas ni espacios)", async () => {
      const box = await openDelete();
      const submit = box.getByRole("button", { name: "Eliminar cuenta" });
      expect(submit).toBeDisabled();
      await userEvent.type(box.getByLabelText(/Escribe su correo/), "beto@correo.co");
      expect(submit).toBeDisabled();
      await userEvent.clear(box.getByLabelText(/Escribe su correo/));
      await userEvent.type(box.getByLabelText(/Escribe su correo/), " BETO@correo.com ");
      expect(submit).toBeEnabled();
    });

    it("mientras se envía dice 'Eliminando…'", async () => {
      // Se resuelve al final: React encadena las acciones pendientes y una sin terminar frenaría las demás pruebas.
      let finish: (state: object) => void = () => {};
      actions.deleteAccountByAdminAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const box = await openDelete();
      await userEvent.type(box.getByLabelText(/Escribe su correo/), "beto@correo.com");
      await userEvent.type(codeField(), "654321");
      await userEvent.click(box.getByRole("button", { name: "Eliminar cuenta" }));
      expect(await box.findByRole("button", { name: "Eliminando…" })).toBeDisabled();
      finish({ error: "Esta cuenta ya no existe." });
      expect(await box.findByRole("alert")).toHaveTextContent("Esta cuenta ya no existe.");
    });

    it("envía la cuenta, el correo y el código; muestra el error del correo junto al campo", async () => {
      actions.deleteAccountByAdminAction.mockResolvedValue({ error: "El correo no coincide con el de la cuenta.", field: "email" });
      const box = await openDelete();
      await userEvent.type(box.getByLabelText(/Escribe su correo/), "beto@correo.com");
      await userEvent.type(codeField(), "654321");
      await userEvent.click(box.getByRole("button", { name: "Eliminar cuenta" }));

      const sent = actions.deleteAccountByAdminAction.mock.calls[0][1] as FormData;
      expect(Object.fromEntries(sent)).toEqual({ userId: "cuenta-1", email: "beto@correo.com", code: "654321" });
      expect(await box.findByText("El correo no coincide con el de la cuenta.")).toBeInTheDocument();
      expect(box.getByLabelText(/Escribe su correo/)).toHaveAttribute("aria-invalid", "true");
    });
  });
});

describe("AccountActions · errores del código en español", () => {
  it("sin código, o sin 6 dígitos, lo dice debajo del campo y no envía", async () => {
    render(<AccountActions target={target()} />);
    await userEvent.click(actionsSection().getByRole("button", { name: "Desbloquear" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Desbloquear" }));
    expect(codeField()).toHaveAccessibleDescription("Escribe el código de 6 dígitos de Google Authenticator.");
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(codeField(), "12a");
    expect(codeField()).toHaveAccessibleDescription("El código tiene 6 dígitos, solo números.");
    expect(actions.unlockLoginAction).not.toHaveBeenCalled();
  });
});

describe("dar y quitar el rol de admin (solo el super admin)", () => {
  const danger = () => within(screen.getByRole("region", { name: "Zona de peligro" }));
  const rowTitles = () => danger().getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent);

  it("sin el permiso (un admin común) no aparece", () => {
    render(<AccountActions target={target()} />);
    expect(rowTitles()).toEqual(["Suspender la cuenta", "Eliminar la cuenta"]);
    expect(screen.queryByRole("button", { name: "Hacer admin" })).toBeNull();
  });

  it("para el super admin va al final de la zona de peligro, en rojo, con lo que implica", () => {
    render(<AccountActions target={target()} canMakeAdmin />);
    expect(rowTitles()).toEqual(["Suspender la cuenta", "Eliminar la cuenta", "Darle el rol de admin"]);
    expect(danger().getAllByRole("listitem")[2]).toHaveTextContent("Verá la sección de administración, con datos de todas las cuentas.");
    expect(danger().getByRole("button", { name: "Hacer admin" })).toHaveClass("text-danger");
  });

  it("la ventana explica qué pasa, pide el código y, con éxito, avisa en verde", async () => {
    actions.grantAdminAction.mockResolvedValue({ message: "Beto Ruiz ahora es admin." });
    render(<AccountActions target={target()} canMakeAdmin />);
    await userEvent.click(danger().getByRole("button", { name: "Hacer admin" }));
    expect(dialog()).toHaveAccessibleName("¿Hacer admin a Beto Ruiz?");
    expect(dialog()).toHaveAccessibleDescription(
      "Verá la sección de administración, con los datos de todas las cuentas. Se cierran sus sesiones y, al volver a entrar, tendrá que configurar la verificación en dos pasos. Solo tú puedes quitarle el rol.",
    );
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Hacer admin" }));
    expect(Object.fromEntries(actions.grantAdminAction.mock.calls[0][1] as FormData)).toEqual({ userId: "cuenta-1", code: "123456" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Beto Ruiz ahora es admin.");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("si el servidor dice que no (p. ej. ya es admin), lo muestra y la ventana sigue abierta", async () => {
    actions.grantAdminAction.mockResolvedValue({ error: "La cuenta ya es admin." });
    render(<AccountActions target={target()} canMakeAdmin />);
    await userEvent.click(danger().getByRole("button", { name: "Hacer admin" }));
    await userEvent.type(codeField(), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Hacer admin" }));
    expect(await within(dialog()).findByText("La cuenta ya es admin.")).toBeVisible();
  });

  it("en la cuenta de otro admin, solo quitarle el rol: explica qué pasa y avisa en rojo", async () => {
    actions.revokeAdminAction.mockResolvedValue({ message: "Carla ya no es admin." });
    render(<RevokeAdminActions target={{ id: "admin-2", name: "Carla" }} />);
    expect(rowTitles()).toEqual(["Quitarle el rol de admin"]);
    expect(danger().getAllByRole("listitem")[0]).toHaveTextContent(
      "Vuelve a ser usuario: se borra su verificación en dos pasos y se cierran sus sesiones.",
    );
    await userEvent.click(danger().getByRole("button", { name: "Quitar admin" }));
    expect(dialog()).toHaveAccessibleName("¿Quitarle el rol de admin a Carla?");
    expect(dialog()).toHaveAccessibleDescription(
      "Vuelve a ser usuario. Se borran su verificación en dos pasos y sus códigos de respaldo, y se cierran sus sesiones. Sus finanzas no se tocan.",
    );
    await userEvent.type(codeField(), "654321");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Quitar admin" }));
    expect(Object.fromEntries(actions.revokeAdminAction.mock.calls[0][1] as FormData)).toEqual({ userId: "admin-2", code: "654321" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Carla ya no es admin.");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelar no envía nada", async () => {
    render(<RevokeAdminActions target={{ id: "admin-2", name: "Carla" }} />);
    await userEvent.click(danger().getByRole("button", { name: "Quitar admin" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.revokeAdminAction).not.toHaveBeenCalled();
  });
});
