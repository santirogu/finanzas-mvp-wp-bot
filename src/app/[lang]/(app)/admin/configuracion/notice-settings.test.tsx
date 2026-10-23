import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findToast, renderWithToaster as render, toasts } from "../../../../../../test/toaster";
import type { NoticeSettingsProps } from "./notice-settings";

// Las Server Actions se simulan: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo responde a cada
// resultado). Lo que hacen de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({ publishNoticeAction: vi.fn(), removeNoticeAction: vi.fn() }));
vi.mock("./actions", () => actions);

const { NoticeSettings } = await import("./notice-settings");

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

const active: NonNullable<NoticeSettingsProps["notice"]> = {
  message: "Mantenimiento el sábado de 8 a 9",
  messageEn: "Maintenance on Saturday from 8 to 9",
  tone: "important",
  endsAtInput: "2026-10-25T20:00",
  endsAtLabel: "25 de oct. de 2026, 8:00 p. m.",
  active: true,
  published: "Ana Admin · 23 de oct. de 2026, 10:00 a. m.",
};
const section = () => within(screen.getByRole("region", { name: "Aviso para todos" }));
const dialog = () => within(screen.getByRole("dialog"));

describe("NoticeSettings", () => {
  it("sin aviso: lo dice y ofrece publicar uno", () => {
    render(<NoticeSettings notice={null} />);
    expect(section().getByText("No hay ningún aviso.")).toBeInTheDocument();
    expect(section().getByRole("button", { name: "Publicar un aviso" })).toBeInTheDocument();
    expect(section().queryByRole("button", { name: "Quitar el aviso" })).toBeNull();
  });

  it("con uno vigente: cómo se ve, el inglés, hasta cuándo y quién lo publicó", () => {
    render(<NoticeSettings notice={active} />);
    expect(section().getByRole("region", { name: "Aviso importante" })).toHaveTextContent("Mantenimiento el sábado de 8 a 9");
    expect(section().getByText("Maintenance on Saturday from 8 to 9")).toHaveAttribute("lang", "en");
    expect(section().getByText("Importante · Se ve hasta el 25 de oct. de 2026, 8:00 p. m. (hora de Colombia).")).toHaveClass("text-muted");
    expect(section().getByText("Publicado por Ana Admin · 23 de oct. de 2026, 10:00 a. m.")).toBeInTheDocument();
    // La vista previa no se cierra.
    expect(section().queryByRole("button", { name: "Ocultar este aviso" })).toBeNull();
  });

  it("uno vencido: en rojo, que ya no se ve", () => {
    render(<NoticeSettings notice={{ ...active, messageEn: null, active: false }} />);
    expect(section().getByText("Importante · Venció el 25 de oct. de 2026, 8:00 p. m.: ya no se ve.")).toHaveClass("text-danger");
  });

  it("publicar uno nuevo: Información y mañana a la misma hora, en punto, dentro del rango", async () => {
    actions.publishNoticeAction.mockResolvedValue({ message: "Se publicó el aviso: se ve hasta el 24 de oct." });
    render(<NoticeSettings notice={null} />);
    await userEvent.click(section().getByRole("button", { name: "Publicar un aviso" }));
    expect(screen.getByRole("dialog", { name: "Publicar un aviso" })).toHaveAccessibleDescription(/se apaga solo en la fecha de fin/);
    expect(dialog().getByRole("radio", { name: /^Información/ })).toBeChecked();
    const end = dialog().getByLabelText("Hasta (hora de Colombia)") as HTMLInputElement;
    expect(end.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
    expect(end.min < end.value && end.value < end.max).toBe(true);

    await userEvent.type(dialog().getByLabelText("Aviso"), "Nuevo: presupuestos");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Publicar" }));

    const sent = actions.publishNoticeAction.mock.calls[0][1] as FormData;
    expect([sent.get("message"), sent.get("messageEn"), sent.get("tone"), sent.get("endsAt"), sent.get("code")]).toEqual([
      "Nuevo: presupuestos",
      "",
      "info",
      end.value,
      "123456",
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await findToast();
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveFocus();
  });

  it("cambiarlo: la ventana viene con el aviso de ahora", async () => {
    render(<NoticeSettings notice={active} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el aviso" }));
    expect(dialog().getByLabelText("Aviso")).toHaveValue("Mantenimiento el sábado de 8 a 9");
    expect(dialog().getByLabelText(/^Aviso en inglés/)).toHaveValue("Maintenance on Saturday from 8 to 9");
    expect(dialog().getByRole("radio", { name: /^Importante/ })).toBeChecked();
    expect(dialog().getByLabelText("Hasta (hora de Colombia)")).toHaveValue("2026-10-25T20:00");
  });

  it("un error del servidor va en su campo y lo escrito sigue ahí (el código no)", async () => {
    actions.publishNoticeAction.mockResolvedValue({ error: "Esa fecha ya pasó: elige una más adelante.", field: "endsAt" });
    render(<NoticeSettings notice={null} />);
    await userEvent.click(section().getByRole("button", { name: "Publicar un aviso" }));
    await userEvent.type(dialog().getByLabelText("Aviso"), "Nuevo: presupuestos");
    await userEvent.click(dialog().getByRole("radio", { name: /^Importante/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Publicar" }));
    expect(dialog().getByLabelText("Hasta (hora de Colombia)")).toHaveAccessibleDescription(/Esa fecha ya pasó: elige una más adelante\./);
    expect(dialog().getByLabelText("Aviso")).toHaveValue("Nuevo: presupuestos");
    expect(dialog().getByRole("radio", { name: /^Importante/ })).toBeChecked();
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveValue("");
    expect(toasts()).toHaveLength(0);
  });

  it("sin el aviso ni el código, lo dice en español y no envía nada", async () => {
    render(<NoticeSettings notice={null} />);
    await userEvent.click(section().getByRole("button", { name: "Publicar un aviso" }));
    await userEvent.click(dialog().getByRole("button", { name: "Publicar" }));
    expect(dialog().getByLabelText("Aviso")).toHaveAccessibleDescription(/Escribe el aviso\./);
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription("Escribe el código de 6 dígitos de Google Authenticator.");
    expect(actions.publishNoticeAction).not.toHaveBeenCalled();
  });

  it("quitarlo pide el código; el aviso (en rojo) recibe el foco", async () => {
    actions.removeNoticeAction.mockResolvedValueOnce({ error: "El código no es correcto.", field: "code" }).mockResolvedValueOnce({ message: "Se quitó el aviso para todos." });
    render(<NoticeSettings notice={active} />);
    await userEvent.click(section().getByRole("button", { name: "Quitar el aviso" }));
    expect(screen.getByRole("dialog", { name: "¿Quitar el aviso?" })).toHaveAccessibleDescription(/Deja de verse de inmediato/);
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "111111");
    await userEvent.click(dialog().getByRole("button", { name: "Quitar" }));
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription("El código no es correcto.");

    // userEvent recuerda el valor de antes de que React limpiara el campo: se borra primero.
    await userEvent.clear(dialog().getByLabelText("Código de Google Authenticator"));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Quitar" }));
    expect((actions.removeNoticeAction.mock.calls[1][1] as FormData).get("code")).toBe("123456");
    const toast = await findToast();
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
  });
});

describe("NoticeSettings en inglés", () => {
  it("los textos y la ventana", async () => {
    render(<NoticeSettings notice={{ ...active, endsAtLabel: "Oct 25, 2026, 8:00 PM", published: "Ana Admin · Oct 23, 2026" }} />, { english: true });
    const card = within(screen.getByRole("region", { name: "Notice for everyone" }));
    expect(card.getByText("Important · It shows until Oct 25, 2026, 8:00 PM (Colombia time).")).toBeInTheDocument();
    await userEvent.click(card.getByRole("button", { name: "Change the notice" }));
    expect(dialog().getByRole("radio", { name: /^Important/ })).toBeChecked();
    expect(dialog().getByLabelText("Until (Colombia time)")).toHaveValue("2026-10-25T20:00");
  });
});
