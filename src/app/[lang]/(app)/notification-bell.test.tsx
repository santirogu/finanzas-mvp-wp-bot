import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarkReadState } from "@/modules/notifications/actions";
import type { BellNotification } from "@/modules/notifications/notifications";
import type { UpcomingItem } from "@/modules/reports/upcoming";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

const markRead = vi.hoisted(() => vi.fn<(prev: MarkReadState, data: FormData) => Promise<MarkReadState>>());
vi.mock("@/modules/notifications/actions", () => ({ markNotificationsReadAction: markRead }));
vi.mock("@/modules/reports/actions", () => ({ skipFixedPaymentAction: vi.fn(), registerFixedPaymentAction: vi.fn() }));

const { NotificationBell } = await import("./notification-bell");

const notification = (description: string, when = "En 2 días"): Extract<BellNotification, { kind: "payment" }> => {
  const key = description.toLowerCase();
  const item: UpcomingItem = {
    id: `${key} 2026-10`,
    key,
    description,
    emoji: "🏠",
    month: "2026-10",
    monthName: "octubre",
    amount: "≈ −$120.000,00",
    when,
    dateLine: "15 de oct · lo sueles pagar el 15",
    overdue: when === "Atrasado",
    category: "🩺 Salud",
    amountInput: "120.000,00",
  };
  return { kind: "payment" as const, id: `pago|2026-10|${key}`, item };
};
const TWO = [notification("Gimnasio", "Atrasado"), notification("Netflix")];

const reminder = (days = 4, firstTime = false): Extract<BellNotification, { kind: "reminder" }> => ({
  kind: "reminder",
  id: "registro|2026-10-16",
  reminder: { since: "2026-10-16", days, firstTime },
});

const bell = () => screen.getByRole("button", { name: /^Notificaciones/ });
const panel = () => within(screen.getByRole("group", { name: "Notificaciones" }));
const sent = (call = 0) => markRead.mock.calls[call][1].getAll("id");

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
  markRead.mockReset();
});

describe("NotificationBell", () => {
  it("cerrada: la campana con el número en rojo y cuántas sin leer en su nombre", () => {
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    expect(bell()).toHaveAccessibleName("Notificaciones: 2 sin leer");
    expect(bell()).toHaveAttribute("aria-expanded", "false");
    expect(bell().querySelector(".bg-danger")).toHaveTextContent("2");
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();
  });

  it("sin notificaciones: sin número; abierta, lo dice", async () => {
    render(<NotificationBell notifications={[]} today="2026-10-20" upcomingEnabled />);
    expect(bell()).toHaveAccessibleName("Notificaciones");
    expect(bell().querySelector(".bg-danger")).toBeNull();
    await userEvent.setup().click(bell());
    expect(panel().getByText("No tienes notificaciones nuevas.")).toBeVisible();
    expect(panel().queryByRole("button", { name: /Marcar/ })).toBeNull();
  });

  it("más de 99, dice 99+", () => {
    render(<NotificationBell notifications={Array.from({ length: 120 }, (_, i) => notification(`Gasto ${i}`))} today="2026-10-20" upcomingEnabled />);
    expect(bell().querySelector(".bg-danger")).toHaveTextContent("99+");
  });

  it("abierta: cada aviso con sus acciones y Marcar como leída; abajo, el enlace al Resumen", async () => {
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    await userEvent.setup().click(bell());
    expect(bell()).toHaveAttribute("aria-expanded", "true");
    const items = panel().getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("button", { name: "Registrar pago de Gimnasio" })).toBeVisible();
    expect(within(items[0]).getByRole("button", { name: "Este pago ya no aplica: Gimnasio, octubre" })).toBeVisible();
    expect(within(items[0]).getByRole("button", { name: "Marcar como leída: Gimnasio, octubre" })).toBeVisible();
    expect(within(items[0]).getByText("Atrasado")).toHaveClass("text-danger");
    expect(panel().getByRole("link", { name: "Ver los próximos pagos en el Resumen" })).toHaveAttribute("href", "/dashboard");
  });

  it("Marcar como leída manda su id y avisa en verde con el foco", async () => {
    markRead.mockResolvedValue({ message: "Se marcó como leída", tone: "success" });
    const user = userEvent.setup();
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    await user.click(bell());
    await user.click(panel().getByRole("button", { name: "Marcar como leída: Netflix, octubre" }));
    expect(sent()).toEqual(["pago|2026-10|netflix"]);
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se marcó como leída");
    expect(toast).toHaveFocus();
  });

  it("Marcar todas como leídas manda todos los ids (solo aparece con más de una)", async () => {
    markRead.mockResolvedValue({ message: "Se marcaron 2 como leídas", tone: "success" });
    const user = userEvent.setup();
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    await user.click(bell());
    await user.click(panel().getByRole("button", { name: "Marcar todas como leídas" }));
    expect(sent()).toEqual(["pago|2026-10|gimnasio", "pago|2026-10|netflix"]);
  });

  it("un error de la acción queda junto al botón", async () => {
    markRead.mockResolvedValue({ error: "No se pudo marcar como leída." });
    const user = userEvent.setup();
    render(<NotificationBell notifications={TWO.slice(0, 1)} today="2026-10-20" upcomingEnabled />);
    await user.click(bell());
    expect(panel().queryByRole("button", { name: "Marcar todas como leídas" })).toBeNull();
    await user.click(panel().getByRole("button", { name: /^Marcar como leída/ }));
    expect(await panel().findByRole("alert")).toHaveTextContent("No se pudo marcar como leída.");
  });

  it("Escape la cierra y el foco vuelve a la campana; con la ventana de Registrar pago abierta, Escape no la cierra", async () => {
    const user = userEvent.setup();
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    await user.click(bell());
    await user.click(panel().getByRole("button", { name: "Registrar pago de Gimnasio" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago de Gimnasio" });
    fireEvent.keyDown(within(dialog).getByLabelText("Monto"), { key: "Escape" });
    expect(screen.getByRole("group", { name: "Notificaciones" })).toBeVisible();
    // (jsdom no cierra la ventana con Escape, como el navegador: se cierra con Cancelar.)
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();
    expect(bell()).toHaveFocus();
  });

  it("tocar fuera, salir con Tab o seguir el enlace la cierran; tocar dentro, no; otra tecla tampoco", async () => {
    const user = userEvent.setup();
    render(
      <>
        <NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />
        <button type="button">Después</button>
      </>,
    );
    await user.click(bell());
    await user.click(panel().getAllByRole("listitem")[0]);
    await user.keyboard("a");
    expect(screen.getByRole("group", { name: "Notificaciones" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Después" }));
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();

    await user.click(bell());
    fireEvent.blur(bell(), { relatedTarget: screen.getByRole("button", { name: "Después" }) });
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();

    await user.click(bell());
    const link = panel().getByRole("link", { name: "Ver los próximos pagos en el Resumen" });
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();
  });

  it("perder el foco hacia ningún lado (la ventana) no la cierra; tocarla otra vez, sí", async () => {
    const user = userEvent.setup();
    render(<NotificationBell notifications={TWO} today="2026-10-20" upcomingEnabled />);
    await user.click(bell());
    fireEvent.blur(bell(), { relatedTarget: null });
    expect(screen.getByRole("group", { name: "Notificaciones" })).toBeVisible();
    await user.click(bell());
    expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();
  });

  describe("el recordatorio de registro", () => {
    it("va primero, con cuántos días van, Registrar un egreso y su Marcar como leída; después, los pagos", async () => {
      markRead.mockResolvedValue({ message: "Se marcó como leída", tone: "success" });
      const user = userEvent.setup();
      render(<NotificationBell notifications={[reminder(), ...TWO]} today="2026-10-20" upcomingEnabled />);
      expect(bell()).toHaveAccessibleName("Notificaciones: 3 sin leer");
      await user.click(bell());
      const texts = panel().getAllByText(/sin registrar nada|Próximos pagos de tus gastos fijos/).map((p) => p.textContent);
      expect(texts).toEqual(["Llevas 4 días sin registrar nada.", "Próximos pagos de tus gastos fijos."]);
      expect(panel().getByText("Registra lo que te falte para que tus cuentas del mes queden completas.")).toBeVisible();
      expect(panel().getByRole("link", { name: "Registrar un egreso" })).toHaveAttribute("href", "/egresos");
      expect(panel().getAllByRole("listitem")).toHaveLength(2);
      await user.click(panel().getByRole("button", { name: "Marcar como leída: el recordatorio de registro" }));
      expect(sent()).toEqual(["registro|2026-10-16"]);
      expect(await findToast()).toHaveTextContent("Se marcó como leída");
    });

    it("Marcar todas como leídas lo incluye", async () => {
      markRead.mockResolvedValue({ message: "Se marcaron 2 como leídas", tone: "success" });
      const user = userEvent.setup();
      render(<NotificationBell notifications={[reminder(), TWO[1]]} today="2026-10-20" upcomingEnabled />);
      await user.click(bell());
      await user.click(panel().getByRole("button", { name: "Marcar todas como leídas" }));
      expect(sent()).toEqual(["registro|2026-10-16", "pago|2026-10|netflix"]);
    });

    it("solo él, con los avisos de pagos apagados: sin el título de los pagos ni el enlace a ellos", async () => {
      const user = userEvent.setup();
      render(<NotificationBell notifications={[reminder(1)]} today="2026-10-20" upcomingEnabled={false} />);
      await user.click(bell());
      expect(panel().getByText("Llevas 1 día sin registrar nada.")).toBeVisible();
      expect(panel().queryByText("Próximos pagos de tus gastos fijos.")).toBeNull();
      expect(panel().queryByRole("link", { name: "Ver los próximos pagos en el Resumen" })).toBeNull();
      expect(panel().queryByRole("button", { name: "Marcar todas como leídas" })).toBeNull();
    });

    it("sin movimientos todavía, lo dice; seguir Registrar un egreso cierra la campana", async () => {
      const user = userEvent.setup();
      render(<NotificationBell notifications={[reminder(5, true)]} today="2026-10-20" upcomingEnabled />);
      await user.click(bell());
      expect(panel().getByText("Todavía no registras ningún movimiento.")).toBeVisible();
      const link = panel().getByRole("link", { name: "Registrar un egreso" });
      link.addEventListener("click", (event) => event.preventDefault());
      await user.click(link);
      expect(screen.queryByRole("group", { name: "Notificaciones" })).toBeNull();
    });
  });
});

describe("NotificationBell · en inglés", () => {
  it("la campana, la lista y Marcar como leída, en inglés", async () => {
    markRead.mockResolvedValue({ message: "2 marked as read", tone: "success" });
    const [gym, netflix] = TWO.map(({ id, item }) => ({ kind: "payment" as const, id, item: { ...item, monthName: "October" } }));
    render(<NotificationBell notifications={[gym, netflix]} today="2026-10-20" upcomingEnabled />, { english: true });
    await userEvent.click(screen.getByRole("button", { name: "Notifications: 2 unread" }));
    const list = within(screen.getByRole("group", { name: "Notifications" }));
    expect(list.getByText("Upcoming payments of your bills.")).toBeVisible();
    expect(list.getByRole("button", { name: "Mark as read: Gimnasio, October" })).toHaveTextContent("Mark as read");
    expect(list.getByRole("link", { name: "See upcoming payments in the Overview" })).toHaveAttribute("href", "/dashboard");
    await userEvent.click(list.getByRole("button", { name: "Mark all as read" }));
    expect(await findToast()).toHaveTextContent("2 marked as read");
  });

  it("el recordatorio de registro, en inglés", async () => {
    render(<NotificationBell notifications={[reminder()]} today="2026-10-20" upcomingEnabled={false} />, { english: true });
    await userEvent.click(screen.getByRole("button", { name: "Notifications: 1 unread" }));
    const list = within(screen.getByRole("group", { name: "Notifications" }));
    expect(list.getByText("You haven't added anything in 4 days.")).toBeVisible();
    expect(list.getByText("Add what's missing so your month's numbers stay complete.")).toBeVisible();
    expect(list.getByRole("link", { name: "Add an expense" })).toHaveAttribute("href", "/egresos");
    expect(list.getByRole("button", { name: "Mark as read: the reminder to add transactions" })).toHaveTextContent("Mark as read");
  });

  it("sin notificaciones", async () => {
    render(<NotificationBell notifications={[]} today="2026-10-20" upcomingEnabled />, { english: true });
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("You don't have new notifications.")).toBeVisible();
  });
});
