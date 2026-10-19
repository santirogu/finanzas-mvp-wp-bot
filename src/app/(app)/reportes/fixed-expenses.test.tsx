import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixedExpenseState } from "@/modules/reports/actions";
import type { FixedOption, RecurringExpense } from "@/modules/reports/recurring";
import { findToast, renderWithToaster as render } from "../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: FixedExpenseState, data: FormData) => Promise<FixedExpenseState>>());
vi.mock("@/modules/reports/actions", () => ({ chooseFixedExpenseAction: action }));

const { FixedExpenses } = await import("./fixed-expenses");

const item = (description: string, amount: number, origin: RecurringExpense["origin"] = "auto", months = 4): RecurringExpense => ({
  key: description.toLowerCase(),
  description,
  emoji: "🏠",
  amount,
  months,
  origin,
});
const option = (description: string): FixedOption => ({ key: description.toLowerCase(), description, emoji: "🛒" });

const ITEMS = [item("Arriendo", 1800000), item("Seguro del carro", 950000, "manual", 1)];
const props = {
  items: ITEMS,
  removed: [option("Netflix")],
  candidates: [option("Mercado"), option("Gimnasio")],
  total: 2750000,
  periodMonths: 12,
  averageExpense: 2750000,
  currency: "COP",
};

const section = () => within(screen.getByRole("region", { name: "Gastos fijos" }));
const sent = (call = 0) => Object.fromEntries(action.mock.calls[call][1]);

beforeEach(() => {
  action.mockReset();
});

describe("FixedExpenses", () => {
  it("cada gasto con sus meses (y si lo agregó la persona), el monto, el total y su parte del gasto promedio", () => {
    render(<FixedExpenses {...props} />);
    const rows = section().getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ArriendoEn 4 de 12 meses−$1.800.000,00");
    expect(rows[1]).toHaveTextContent("Seguro del carroEn 1 de 12 meses · Agregado por ti−$950.000,00");
    expect(section().getByText("Total al mes").parentElement).toHaveTextContent("−$2.750.000,00");
    expect(section().getByText("Son el 100% de tu gasto promedio por mes.")).toBeVisible();
  });

  it("de un período de un mes, dice \"mes\"; sin gasto promedio, no dice qué parte es", () => {
    render(<FixedExpenses {...props} periodMonths={1} averageExpense={0} />);
    expect(section().getAllByRole("listitem")[0]).toHaveTextContent("En 4 de 1 mes");
    expect(section().queryByText(/de tu gasto promedio/)).toBeNull();
  });

  it("quitar uno detectado lo manda a quitados; uno agregado, simplemente sale; y avisa en rojo con el foco", async () => {
    action.mockResolvedValue({ message: "Se quitó «Arriendo» de los gastos fijos", tone: "removal" });
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(section().getByRole("button", { name: "Quitar Arriendo de los gastos fijos" }));
    expect(sent()).toEqual({ description: "Arriendo", action: "exclude" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se quitó «Arriendo» de los gastos fijos");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();

    await user.click(section().getByRole("button", { name: "Quitar Seguro del carro de los gastos fijos" }));
    expect(sent(1)).toEqual({ description: "Seguro del carro", action: "unadd" });
  });

  it("un error de la acción queda junto al botón, sin aviso", async () => {
    action.mockResolvedValue({ error: "Elige un egreso." });
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(section().getByRole("button", { name: "Quitar Arriendo de los gastos fijos" }));
    expect(await section().findByRole("alert")).toHaveTextContent("Elige un egreso.");
  });

  it("los quitados, en un desplegable, se pueden volver a poner", async () => {
    action.mockResolvedValue({ message: "Volvió «Netflix» a los gastos fijos", tone: "success" });
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(section().getByText("Quitados (1)"));
    await user.click(section().getByRole("button", { name: "Volver a poner Netflix en los gastos fijos" }));
    expect(sent()).toEqual({ description: "Netflix", action: "restore" });
    expect(await findToast()).toHaveAttribute("data-tone", "success");
  });

  describe("agregar un gasto fijo", () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(section().getByRole("button", { name: "Agregar un gasto fijo" }));
      return section().getByLabelText("Egreso");
    };

    it("abre el selector con los egresos del período, con el foco", async () => {
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      const select = await open(user);
      expect(select).toHaveFocus();
      expect(select).toBeRequired();
      expect(select).toHaveClass("input");
      expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Elige un egreso del período", "🛒 Mercado", "🛒 Gimnasio"]);
    });

    it("sin elegir, el error en español debajo del selector y sin llamar al servidor", async () => {
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      const select = await open(user);
      await user.click(section().getByRole("button", { name: "Agregar" }));
      expect(await section().findByText("Elige un egreso.")).toBeVisible();
      expect(select).toHaveAttribute("aria-invalid", "true");
      expect(select).toHaveAccessibleDescription("Elige un egreso.");
      expect(action).not.toHaveBeenCalled();
    });

    it("elegido, lo agrega: se cierra y avisa en verde", async () => {
      action.mockResolvedValue({ message: "Se agregó «Gimnasio» a los gastos fijos", tone: "success" });
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      await user.selectOptions(await open(user), "Gimnasio");
      await user.click(section().getByRole("button", { name: "Agregar" }));
      expect(sent()).toEqual({ action: "include", description: "Gimnasio" });
      expect(await findToast()).toHaveTextContent("Se agregó «Gimnasio» a los gastos fijos");
      expect(section().queryByLabelText("Egreso")).toBeNull();
    });

    it("un error del servidor queda debajo del selector", async () => {
      action.mockResolvedValue({ error: "Ese egreso no está entre tus movimientos." });
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      await user.selectOptions(await open(user), "Gimnasio");
      await user.click(section().getByRole("button", { name: "Agregar" }));
      expect(await section().findByText("Ese egreso no está entre tus movimientos.")).toBeVisible();
      expect(section().getByLabelText("Egreso")).toBeInTheDocument();
    });

    it("Cancelar lo cierra sin enviar y el foco vuelve al botón", async () => {
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      await open(user);
      await user.click(section().getByRole("button", { name: "Cancelar" }));
      expect(section().queryByLabelText("Egreso")).toBeNull();
      await vi.waitFor(() => expect(section().getByRole("button", { name: "Agregar un gasto fijo" })).toHaveFocus());
      expect(action).not.toHaveBeenCalled();
    });

    it("sin egresos para agregar, no aparece", () => {
      render(<FixedExpenses {...props} candidates={[]} />);
      expect(section().queryByRole("button", { name: "Agregar un gasto fijo" })).toBeNull();
    });
  });

  it("sin gastos fijos lo dice, sin total; y sin quitados no hay desplegable", () => {
    render(<FixedExpenses {...props} items={[]} removed={[]} total={0} />);
    expect(section().getByText("Todavía no hay egresos que se repitan cada mes.")).toBeVisible();
    expect(section().queryByText("Total al mes")).toBeNull();
    expect(section().queryByText(/^Quitados/)).toBeNull();
    expect(section().getByRole("button", { name: "Agregar un gasto fijo" })).toBeVisible();
  });
});
