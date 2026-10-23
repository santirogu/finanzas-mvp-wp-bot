import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReminderSettingsState } from "@/modules/reminders/actions";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: ReminderSettingsState, data: FormData) => Promise<ReminderSettingsState>>());
vi.mock("@/modules/reminders/actions", () => ({ saveReminderSettingsAction: action }));

const { ReminderSettings } = await import("./reminder-settings");

const section = () => within(screen.getByRole("region", { name: "Recordatorio de registro" }));
const toggle = () => section().getByRole("switch", { name: /Recordatorio/ });
const days = () => section().getByLabelText("Días sin registrar");
const save = () => section().getByRole("button", { name: "Guardar" });
const sent = () => Object.fromEntries(action.mock.calls[0][1]);

beforeEach(() => {
  action.mockReset();
});

describe("ReminderSettings", () => {
  it("muestra lo guardado: prendido, con sus días y la explicación", () => {
    render(<ReminderSettings enabled days={3} />);
    expect(section().getByText(/te lo recordamos en el Resumen y en la campana/)).toBeVisible();
    expect(toggle()).toBeChecked();
    expect(section().getByText("Prendido")).toBeVisible();
    expect(days()).toHaveValue(3);
    expect(days()).toHaveAttribute("min", "1");
    expect(days()).toHaveAttribute("max", "14");
    expect(days()).toHaveAccessibleDescription(/días \(de 1 a 14\)/);
  });

  it("apagado, el campo de los días queda inactivo; al prenderlo, vuelve", async () => {
    const user = userEvent.setup();
    render(<ReminderSettings enabled={false} days={5} />);
    expect(toggle()).not.toBeChecked();
    expect(section().getByText("Apagado")).toBeVisible();
    expect(days()).toBeDisabled();
    expect(days()).toHaveValue(5);
    await user.click(toggle());
    expect(days()).toBeEnabled();
    expect(section().getByText("Prendido")).toBeVisible();
  });

  it("Guardar manda el interruptor y los días, y avisa en verde; quedan los días guardados", async () => {
    action.mockResolvedValue({ message: "Se guardó: te lo recordaremos si pasan 7 días sin registrar nada", tone: "success" });
    const user = userEvent.setup();
    render(<ReminderSettings enabled days={3} />);
    await user.clear(days());
    await user.type(days(), "7");
    await user.click(save());
    expect(sent()).toEqual({ enabled: "on", days: "7" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se guardó: te lo recordaremos si pasan 7 días sin registrar nada");
    expect(toast).toHaveAttribute("data-tone", "success");
    await waitFor(() => expect(save()).toBeEnabled());
    expect(days()).toHaveValue(7);
  });

  it("apagarlo manda solo el interruptor apagado (los días se conservan), avisa en rojo y queda apagado", async () => {
    action.mockResolvedValue({ message: "Se apagó el recordatorio de registro", tone: "removal" });
    const user = userEvent.setup();
    render(<ReminderSettings enabled days={3} />);
    await user.click(toggle());
    await user.click(save());
    expect(sent()).toEqual({});
    expect(await findToast()).toHaveAttribute("data-tone", "removal");
    await waitFor(() => expect(save()).toBeEnabled());
    expect(toggle()).not.toBeChecked();
    expect(section().getByText("Apagado")).toBeVisible();
    expect(days()).toBeDisabled();
  });

  it.each([
    ["15", "Escribe un número de días de 1 a 14."],
    ["0", "Escribe un número de días de 1 a 14."],
    ["2.5", "Escribe un número de días de 1 a 14."],
    ["", "Escribe después de cuántos días quieres el recordatorio."],
  ])("con %j no envía y lo dice debajo del campo, en español", async (value, message) => {
    const user = userEvent.setup();
    render(<ReminderSettings enabled days={3} />);
    await user.clear(days());
    if (value) fireEvent.change(days(), { target: { value } });
    await user.click(save());
    expect(action).not.toHaveBeenCalled();
    expect(days()).toHaveAttribute("aria-invalid", "true");
    expect(days()).toHaveAccessibleDescription(new RegExp(message.replace(".", "\\.")));
    expect(days()).toHaveFocus();
  });

  it("el error del servidor queda debajo del campo, sin aviso; mientras guarda, el botón espera", async () => {
    let finish!: (state: ReminderSettingsState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<ReminderSettings enabled days={3} />);
    await user.click(save());
    await waitFor(() => expect(section().getByRole("button", { name: "Guardando…" })).toBeDisabled());
    finish({ error: "Escribe un número de días de 1 a 14.", field: "days" });
    expect(await section().findByText("Escribe un número de días de 1 a 14.")).toBeVisible();
    expect(days()).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si se toca el interruptor mientras guarda, al terminar muestra lo que se envió", async () => {
    let finish!: (state: ReminderSettingsState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<ReminderSettings enabled days={3} />);
    await user.click(toggle());
    await user.click(save());
    await waitFor(() => expect(section().getByRole("button", { name: "Guardando…" })).toBeDisabled());
    await user.click(toggle());
    expect(section().getByText("Prendido")).toBeVisible();
    finish({ message: "Se apagó el recordatorio de registro", tone: "removal" });
    await waitFor(() => expect(save()).toBeEnabled());
    expect(toggle()).not.toBeChecked();
    expect(section().getByText("Apagado")).toBeVisible();
  });
});

describe("ReminderSettings · en inglés", () => {
  it("la sección, el interruptor, los días y su mensaje, en inglés", async () => {
    render(<ReminderSettings enabled days={3} />, { english: true });
    const settings = within(screen.getByRole("region", { name: "Reminder to add transactions" }));
    expect(settings.getByRole("switch", { name: /Reminder/ })).toBeChecked();
    expect(settings.getByText("On")).toBeVisible();
    const days = settings.getByLabelText("Days without adding");
    expect(days).toHaveAccessibleDescription(/days \(from 1 to 14\)/);
    await userEvent.clear(days);
    await userEvent.click(settings.getByRole("button", { name: "Save" }));
    expect(await settings.findByText("Enter after how many days you want the reminder.")).toBeVisible();
    fireEvent.change(days, { target: { value: "20" } });
    await userEvent.click(settings.getByRole("button", { name: "Save" }));
    expect(await settings.findByText("Enter a number of days from 1 to 14.")).toBeVisible();
    await userEvent.click(settings.getByRole("switch", { name: /Reminder/ }));
    expect(settings.getByText("Off")).toBeVisible();
  });
});
