import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpcomingSettingsState } from "@/modules/reports/actions";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: UpcomingSettingsState, data: FormData) => Promise<UpcomingSettingsState>>());
vi.mock("@/modules/reports/actions", () => ({ saveUpcomingSettingsAction: action }));

const { NotificationSettings } = await import("./notification-settings");

const section = () => within(screen.getByRole("region", { name: "Notificaciones" }));
const toggle = () => section().getByRole("switch", { name: /Avisos de próximos pagos/ });
const days = () => section().getByLabelText("Días de anticipación");
const save = () => section().getByRole("button", { name: "Guardar" });
const sent = () => Object.fromEntries(action.mock.calls[0][1]);

beforeEach(() => {
  action.mockReset();
});

describe("NotificationSettings", () => {
  it("muestra lo guardado: prendidos, con sus días y la explicación", () => {
    render(<NotificationSettings enabled days={5} />);
    expect(toggle()).toBeChecked();
    expect(section().getByText("Prendidos")).toBeVisible();
    expect(days()).toHaveValue(5);
    expect(days()).toHaveAttribute("min", "0");
    expect(days()).toHaveAttribute("max", "10");
    expect(days()).toHaveAccessibleDescription(/días antes de cada pago \(0 = el mismo día\)/);
    expect(section().getByText(/Los atrasados se avisan siempre/)).toBeVisible();
  });

  it("apagados, el campo de los días queda inactivo; al prenderlos, vuelve", async () => {
    const user = userEvent.setup();
    render(<NotificationSettings enabled={false} days={3} />);
    expect(toggle()).not.toBeChecked();
    expect(section().getByText("Apagados")).toBeVisible();
    expect(days()).toBeDisabled();
    await user.click(toggle());
    expect(days()).toBeEnabled();
    expect(section().getByText("Prendidos")).toBeVisible();
  });

  it("Guardar manda el interruptor y los días, y avisa en verde", async () => {
    action.mockResolvedValue({ message: "Se guardó: te avisaremos 7 días antes de cada pago fijo", tone: "success" });
    const user = userEvent.setup();
    render(<NotificationSettings enabled days={3} />);
    await user.clear(days());
    await user.type(days(), "7");
    await user.click(save());
    expect(sent()).toEqual({ enabled: "on", days: "7" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se guardó: te avisaremos 7 días antes de cada pago fijo");
    expect(toast).toHaveAttribute("data-tone", "success");
  });

  it("apagarlos manda solo el interruptor apagado (los días se conservan) y avisa en rojo", async () => {
    action.mockResolvedValue({ message: "Se apagaron los avisos de próximos pagos", tone: "removal" });
    const user = userEvent.setup();
    render(<NotificationSettings enabled days={3} />);
    await user.click(toggle());
    await user.click(save());
    expect(sent()).toEqual({});
    expect(await findToast()).toHaveAttribute("data-tone", "removal");
  });

  it.each([
    ["11", "Escribe un número entre 0 y 10."],
    ["-1", "Escribe un número entre 0 y 10."],
    ["2.5", "Escribe un número entre 0 y 10."],
    ["", "Escribe cuántos días antes quieres el aviso."],
  ])("con %j no envía y lo dice debajo del campo, en español", async (value, message) => {
    const user = userEvent.setup();
    render(<NotificationSettings enabled days={3} />);
    await user.clear(days());
    if (value) fireEvent.change(days(), { target: { value } });
    await user.click(save());
    expect(action).not.toHaveBeenCalled();
    expect(days()).toHaveAttribute("aria-invalid", "true");
    expect(days()).toHaveAccessibleDescription(new RegExp(message.replace(".", "\\.")));
    expect(days()).toHaveFocus();
  });

  it("el error del servidor queda debajo del campo, sin aviso; mientras guarda, el botón espera", async () => {
    let finish!: (state: UpcomingSettingsState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<NotificationSettings enabled days={3} />);
    await user.click(save());
    await waitFor(() => expect(section().getByRole("button", { name: "Guardando…" })).toBeDisabled());
    finish({ error: "Escribe un número entre 0 y 10.", field: "days" });
    expect(await section().findByText("Escribe un número entre 0 y 10.")).toBeVisible();
    expect(days()).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("NotificationSettings · en inglés", () => {
  it("la sección, el interruptor, los días y su mensaje, en inglés", async () => {
    render(<NotificationSettings enabled days={3} />, { english: true });
    const settings = within(screen.getByRole("region", { name: "Notifications" }));
    expect(settings.getByRole("switch", { name: /Upcoming payment notices/ })).toBeChecked();
    expect(settings.getByText("On")).toBeVisible();
    const days = settings.getByLabelText("Days in advance");
    await userEvent.clear(days);
    await userEvent.click(settings.getByRole("button", { name: "Save" }));
    expect(await settings.findByText("Enter how many days before you want the notice.")).toBeVisible();
    await userEvent.click(settings.getByRole("switch", { name: /Upcoming payment notices/ }));
    expect(settings.getByText("Off")).toBeVisible();
  });
});
