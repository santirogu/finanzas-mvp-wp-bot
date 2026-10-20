import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentSkipState, RegisterPaymentState } from "@/modules/reports/actions";
import type { UpcomingItem } from "@/modules/reports/upcoming";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: PaymentSkipState, data: FormData) => Promise<PaymentSkipState>>());
const register = vi.hoisted(() => vi.fn<(prev: RegisterPaymentState, data: FormData) => Promise<RegisterPaymentState>>());
vi.mock("@/modules/reports/actions", () => ({ skipFixedPaymentAction: action, registerFixedPaymentAction: register }));

const { UpcomingPayments } = await import("./upcoming-payments");

const item = (description: string, when: string, overdue = false): UpcomingItem => ({
  id: `${description.toLowerCase()} 2026-10`,
  description,
  emoji: "🏠",
  month: "2026-10",
  monthName: "octubre",
  amount: "≈ −$1.800.000,00",
  when,
  dateLine: "5 de oct · lo sueles pagar el 5",
  overdue,
  category: "🏠 Vivienda",
  amountInput: "1.800.000,00",
});

const SEVEN = ["Arriendo", "Administración", "Gimnasio", "Internet", "Celular", "Netflix", "Seguro"].map((name, i) =>
  item(name, i === 0 ? "Atrasado" : "En 2 días", i === 0),
);

const card = () => within(screen.getByRole("region", { name: "Próximos pagos" }));
const rows = () => card().getAllByRole("listitem");

const TODAY = "2026-10-20";

// jsdom no abre ventanas modales: basta con marcarla abierta y avisar al cerrarla.
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
  action.mockReset();
  register.mockReset();
});

describe("UpcomingPayments", () => {
  it("cada aviso: el gasto, la fecha, el monto y cuándo; con el enlace a Fijos", () => {
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" today={TODAY} />);
    expect(card().getByRole("heading", { name: "Próximos pagos" })).toBeVisible();
    expect(card().getByText("Tus gastos fijos de los próximos 3 días y los que todavía no registras.")).toBeVisible();
    expect(card().getByRole("link", { name: "Ver gastos fijos" })).toHaveAttribute("href", "/gastos-fijos");
    // (El emoji está en el texto, pero oculto para el lector de pantalla.)
    expect(rows()[1]).toHaveTextContent(/^🏠 Administración5 de oct · lo sueles pagar el 5Registrar pagoEste pago ya no aplica≈ −\$1\.800\.000,00En 2 días$/);
  });

  it("los atrasados, en rojo; los demás, no", () => {
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" today={TODAY} />);
    expect(within(rows()[0]).getByText("Atrasado")).toHaveClass("text-danger");
    expect(within(rows()[1]).getByText("En 2 días")).not.toHaveClass("text-danger");
  });

  it("muestra los primeros 5; 'Mostrar 2 más' abre el resto y 'Mostrar menos' los vuelve a esconder", async () => {
    const user = userEvent.setup();
    render(<UpcomingPayments items={SEVEN} span="de los próximos 3 días" today={TODAY} />);
    expect(rows()).toHaveLength(5);
    const more = card().getByRole("button", { name: "Mostrar 2 más" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(rows()).toHaveLength(7);
    expect(rows()[6]).toHaveTextContent("Seguro");
    expect(more).toHaveAttribute("aria-expanded", "true");
    await user.click(card().getByRole("button", { name: "Mostrar menos" }));
    expect(rows()).toHaveLength(5);
  });

  it("con 5 o menos, sin 'Mostrar más'", () => {
    render(<UpcomingPayments items={SEVEN.slice(0, 5)} span="de los próximos 3 días" today={TODAY} />);
    expect(card().queryByRole("button", { name: /^Mostrar/ })).toBeNull();
  });

  it("'Este pago ya no aplica' manda el gasto y el mes, y avisa en rojo con el foco", async () => {
    action.mockResolvedValue({ message: "No se avisará del pago de octubre de «Arriendo»", tone: "removal" });
    const user = userEvent.setup();
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" today={TODAY} />);
    await user.click(card().getByRole("button", { name: "El pago de octubre de Arriendo ya no aplica" }));
    expect(Object.fromEntries(action.mock.calls[0][1])).toEqual({ description: "Arriendo", month: "2026-10" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("No se avisará del pago de octubre de «Arriendo»");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
  });

  it("mientras se envía, el botón espera; un error queda junto a él, sin aviso", async () => {
    let finish!: (state: PaymentSkipState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<UpcomingPayments items={SEVEN.slice(0, 1)} span="de los próximos 3 días" today={TODAY} />);
    await user.click(card().getByRole("button", { name: /ya no aplica$/ }));
    await waitFor(() => expect(card().getByRole("button", { name: /ya no aplica$/ })).toHaveTextContent("Ocultando…"));
    expect(card().getByRole("button", { name: /ya no aplica$/ })).toBeDisabled();
    finish({ error: "No se pudo ocultar el aviso." });
    expect(await card().findByRole("alert")).toHaveTextContent("No se pudo ocultar el aviso.");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("UpcomingPayments · Registrar pago", () => {
  const dialog = () => within(screen.getByRole("dialog", { name: "Registrar el pago de Arriendo" }));
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" today={TODAY} />);
    await user.click(card().getByRole("button", { name: "Registrar el pago de Arriendo" }));
  };

  it("abre la ventana con la categoría del último pago, su monto y la fecha de hoy (el foco, en el monto)", async () => {
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByRole("dialog", { name: "Registrar el pago de Arriendo" })).toHaveAccessibleDescription(
      "Categoría: 🏠 Vivienda · como el último pago.",
    );
    expect(dialog().getByLabelText("Monto")).toHaveValue("1.800.000,00");
    expect(dialog().getByLabelText("Monto")).toHaveFocus();
    expect(dialog().getByLabelText("Fecha")).toHaveValue(TODAY);
    expect(dialog().getByLabelText("Fecha")).toHaveAttribute("max", TODAY);
  });

  it("el monto se escribe como en Egresos: puntos de miles y, al salir, con sus centavos", async () => {
    const user = userEvent.setup();
    await open(user);
    const amount = dialog().getByLabelText("Monto");
    await user.clear(amount);
    await user.type(amount, "1850000");
    expect(amount).toHaveValue("1.850.000");
    await user.tab();
    expect(amount).toHaveValue("1.850.000,00");
  });

  it("Registrar pago manda el gasto, el monto y la fecha; se cierra y avisa en verde con el foco", async () => {
    register.mockResolvedValue({ message: "Se registró el pago de «Arriendo»: −$1.850.000,00", tone: "success" });
    const user = userEvent.setup();
    await open(user);
    await user.clear(dialog().getByLabelText("Monto"));
    await user.type(dialog().getByLabelText("Monto"), "1850000");
    await user.click(dialog().getByRole("button", { name: "Registrar pago" }));
    expect(Object.fromEntries(register.mock.calls[0][1])).toEqual({ description: "Arriendo", amount: "1.850.000,00", occurredOn: TODAY });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se registró el pago de «Arriendo»: −$1.850.000,00");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sin monto no envía y lo dice debajo del campo; los errores del servidor, junto a su campo o arriba de los botones", async () => {
    const user = userEvent.setup();
    await open(user);
    await user.clear(dialog().getByLabelText("Monto"));
    await user.click(dialog().getByRole("button", { name: "Registrar pago" }));
    expect(register).not.toHaveBeenCalled();
    expect(dialog().getByLabelText("Monto")).toHaveAccessibleDescription("Escribe el monto.");

    register.mockResolvedValueOnce({ error: "La fecha no puede ser después de hoy.", field: "occurredOn" });
    await user.type(dialog().getByLabelText("Monto"), "1000");
    await user.click(dialog().getByRole("button", { name: "Registrar pago" }));
    expect(await dialog().findByText("La fecha no puede ser después de hoy.")).toBeVisible();
    expect(dialog().getByLabelText("Fecha")).toHaveAttribute("aria-invalid", "true");

    register.mockResolvedValueOnce({ error: "No encontramos ese gasto entre tus egresos." });
    await user.click(dialog().getByRole("button", { name: "Registrar pago" }));
    expect(await dialog().findByRole("alert")).toHaveTextContent("No encontramos ese gasto entre tus egresos.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Cancelar la cierra sin enviar nada", async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(dialog().getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("mientras registra, el botón espera", async () => {
    let finish!: (state: RegisterPaymentState) => void;
    register.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await open(user);
    await user.click(dialog().getByRole("button", { name: "Registrar pago" }));
    await waitFor(() => expect(dialog().getByRole("button", { name: "Registrando…" })).toBeDisabled());
    finish({ message: "Se registró", tone: "success" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
