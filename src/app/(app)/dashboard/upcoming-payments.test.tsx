import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentSkipState } from "@/modules/reports/actions";
import type { UpcomingItem } from "@/modules/reports/upcoming";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: PaymentSkipState, data: FormData) => Promise<PaymentSkipState>>());
vi.mock("@/modules/reports/actions", () => ({ skipFixedPaymentAction: action }));

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
});

const SEVEN = ["Arriendo", "Administración", "Gimnasio", "Internet", "Celular", "Netflix", "Seguro"].map((name, i) =>
  item(name, i === 0 ? "Atrasado" : "En 2 días", i === 0),
);

const card = () => within(screen.getByRole("region", { name: "Próximos pagos" }));
const rows = () => card().getAllByRole("listitem");

beforeEach(() => {
  action.mockReset();
});

describe("UpcomingPayments", () => {
  it("cada aviso: el gasto, la fecha, el monto y cuándo; con el enlace a Fijos", () => {
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" />);
    expect(card().getByRole("heading", { name: "Próximos pagos" })).toBeVisible();
    expect(card().getByText("Tus gastos fijos de los próximos 3 días y los que todavía no registras.")).toBeVisible();
    expect(card().getByRole("link", { name: "Ver gastos fijos" })).toHaveAttribute("href", "/gastos-fijos");
    // (El emoji está en el texto, pero oculto para el lector de pantalla.)
    expect(rows()[1]).toHaveTextContent(/^🏠 Administración5 de oct · lo sueles pagar el 5Este pago ya no aplica≈ −\$1\.800\.000,00En 2 días$/);
  });

  it("los atrasados, en rojo; los demás, no", () => {
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" />);
    expect(within(rows()[0]).getByText("Atrasado")).toHaveClass("text-danger");
    expect(within(rows()[1]).getByText("En 2 días")).not.toHaveClass("text-danger");
  });

  it("muestra los primeros 5; 'Mostrar 2 más' abre el resto y 'Mostrar menos' los vuelve a esconder", async () => {
    const user = userEvent.setup();
    render(<UpcomingPayments items={SEVEN} span="de los próximos 3 días" />);
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
    render(<UpcomingPayments items={SEVEN.slice(0, 5)} span="de los próximos 3 días" />);
    expect(card().queryByRole("button", { name: /^Mostrar/ })).toBeNull();
  });

  it("'Este pago ya no aplica' manda el gasto y el mes, y avisa en rojo con el foco", async () => {
    action.mockResolvedValue({ message: "No se avisará del pago de octubre de «Arriendo»", tone: "removal" });
    const user = userEvent.setup();
    render(<UpcomingPayments items={SEVEN.slice(0, 2)} span="de los próximos 3 días" />);
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
    render(<UpcomingPayments items={SEVEN.slice(0, 1)} span="de los próximos 3 días" />);
    await user.click(card().getByRole("button", { name: /ya no aplica$/ }));
    await waitFor(() => expect(card().getByRole("button", { name: /ya no aplica$/ })).toHaveTextContent("Ocultando…"));
    expect(card().getByRole("button", { name: /ya no aplica$/ })).toBeDisabled();
    finish({ error: "No se pudo ocultar el aviso." });
    expect(await card().findByRole("alert")).toHaveTextContent("No se pudo ocultar el aviso.");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
