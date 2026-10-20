import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteAccountState } from "@/modules/account/actions";
import { InEnglish } from "../../../../../test/locale";

const action = vi.hoisted(() => vi.fn<(prev: DeleteAccountState, data: FormData) => Promise<DeleteAccountState>>());
vi.mock("@/modules/account/actions", () => ({ deleteAccountAction: action }));

const { DeleteAccountForm } = await import("./delete-account-form");

const button = () => screen.getByRole("button", { name: /Eliminar mi cuenta para siempre|Eliminando/ });

beforeEach(() => {
  action.mockReset();
});

describe("DeleteAccountForm", () => {
  it("pide la contraseña actual y la palabra de confirmación", () => {
    render(<DeleteAccountForm />);
    const password = screen.getByLabelText("Tu contraseña");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText(/Escribe ELIMINAR para confirmar/)).toBeRequired();
  });

  it("el botón solo se activa al escribir ELIMINAR (sin importar mayúsculas)", async () => {
    render(<DeleteAccountForm />);
    expect(button()).toBeDisabled();

    const confirmation = screen.getByLabelText(/Escribe ELIMINAR para confirmar/);
    await userEvent.type(confirmation, "elimina");
    expect(button()).toBeDisabled();
    await userEvent.type(confirmation, "r");
    expect(button()).toBeEnabled();
  });

  it("envía la contraseña y la confirmación, y muestra los errores que devuelve el servidor", async () => {
    action.mockResolvedValue({ fieldErrors: { password: "Contraseña incorrecta" } });
    render(<DeleteAccountForm />);

    await userEvent.type(screen.getByLabelText("Tu contraseña"), "otra-clave");
    await userEvent.type(screen.getByLabelText(/Escribe ELIMINAR para confirmar/), "ELIMINAR");
    await userEvent.click(button());

    expect(await screen.findByText("Contraseña incorrecta")).toBeVisible();
    expect(Object.fromEntries(action.mock.calls[0][1])).toEqual({
      password: "otra-clave",
      confirmation: "ELIMINAR",
    });
  });

  it("muestra los errores generales como alerta", async () => {
    action.mockResolvedValue({ error: "Por seguridad, la cuenta quedó bloqueada." });
    render(<DeleteAccountForm />);
    await userEvent.type(screen.getByLabelText("Tu contraseña"), "x");
    await userEvent.type(screen.getByLabelText(/Escribe ELIMINAR para confirmar/), "ELIMINAR");
    await userEvent.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent("Por seguridad, la cuenta quedó bloqueada.");
  });

  it("mientras elimina, el botón queda desactivado", async () => {
    let finish!: (state: DeleteAccountState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<DeleteAccountForm />);
    await userEvent.type(screen.getByLabelText("Tu contraseña"), "x");
    await userEvent.type(screen.getByLabelText(/Escribe ELIMINAR para confirmar/), "ELIMINAR");
    await userEvent.click(button());

    expect(await screen.findByRole("button", { name: "Eliminando…" })).toBeDisabled();
    finish({ fieldErrors: { password: "Contraseña incorrecta" } });
    expect(await screen.findByText("Contraseña incorrecta")).toBeVisible();
  });
});

describe("DeleteAccountForm · errores de los campos en español", () => {
  it("sin la contraseña lo dice debajo del campo y no envía", async () => {
    render(<DeleteAccountForm />);
    await userEvent.type(screen.getByLabelText(/Escribe ELIMINAR/), "ELIMINAR");
    await userEvent.click(button());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tu contraseña")).toHaveAccessibleDescription("Escribe tu contraseña.");
    expect(screen.getByLabelText("Tu contraseña")).toHaveFocus();
  });

  it("los errores del servidor también van debajo de su campo", async () => {
    action.mockResolvedValue({ fieldErrors: { password: "Contraseña incorrecta" } });
    render(<DeleteAccountForm />);
    await userEvent.type(screen.getByLabelText("Tu contraseña"), "otra-clave");
    await userEvent.type(screen.getByLabelText(/Escribe ELIMINAR/), "ELIMINAR");
    await userEvent.click(button());
    expect(await screen.findByText("Contraseña incorrecta")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu contraseña")).toHaveAccessibleDescription("Contraseña incorrecta");
    expect(screen.getByLabelText("Tu contraseña")).toHaveAttribute("aria-invalid", "true");
  });
});


describe("DeleteAccountForm · en inglés", () => {
  it("pide la palabra en inglés (DELETE) para habilitar el botón", async () => {
    render(<DeleteAccountForm />, { wrapper: InEnglish });
    const deleteButton = screen.getByRole("button", { name: "Delete my account forever" });
    expect(screen.getByLabelText("Your password")).toBeVisible();
    const confirmation = screen.getByLabelText("Type DELETE to confirm");
    await userEvent.type(confirmation, "eliminar");
    expect(deleteButton).toBeDisabled();
    await userEvent.clear(confirmation);
    await userEvent.type(confirmation, " delete ");
    expect(deleteButton).toBeEnabled();
  });
});
