import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixedExpenseState, FixedNoteState } from "@/modules/reports/actions";
import type { FixedHistoryEntry } from "@/modules/reports/history";
import type { FixedOption, RecurringExpense } from "@/modules/reports/recurring";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: FixedExpenseState, data: FormData) => Promise<FixedExpenseState>>());
const noteAction = vi.hoisted(() => vi.fn<(prev: FixedNoteState, data: FormData) => Promise<FixedNoteState>>());
vi.mock("@/modules/reports/actions", () => ({ chooseFixedExpenseAction: action, saveFixedNoteAction: noteAction }));

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
const entry = (month: string, amount: number, previous: number | null, note: string | null = null): FixedHistoryEntry => ({
  month,
  date: `${month}-05`,
  amount,
  previous,
  diff: previous === null ? null : amount - previous,
  pct: previous === null ? null : Math.round(((amount - previous) / previous) * 100),
  note,
});
const HISTORIES = {
  arriendo: {
    entries: [entry("2026-03", 1890000, 1800000, "Subió con el IPC."), entry("2025-11", 1800000, null)],
    summary: { direction: "up" as const, text: "5% desde marzo" },
  },
  "seguro del carro": { entries: [entry("2026-10", 950000, null)], summary: null },
};
const props = {
  items: ITEMS,
  histories: HISTORIES,
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
  noteAction.mockReset();
});

describe("FixedExpenses", () => {
  it("cada gasto con sus meses (y si lo agregó la persona), el monto, el total y su parte del gasto promedio", () => {
    render(<FixedExpenses {...props} />);
    const rows = section().getAllByRole("listitem").filter((li) => li.parentElement?.tagName === "UL");
    // (El emoji está en el texto, pero oculto para el lector de pantalla.)
    expect(rows[0]).toHaveTextContent(/^Historial de 🏠 Arriendo En 4 de 12 meses 5% desde marzo−\$1\.800\.000,00/);
    expect(rows[1]).toHaveTextContent(/^Historial de 🏠 Seguro del carro En 1 de 12 meses · Agregado por ti−\$950\.000,00/);
    expect(section().getByText("Total al mes").parentElement).toHaveTextContent("−$2.750.000,00");
    expect(section().getByText("Son el 100% de tu gasto promedio por mes.")).toBeVisible();
    // El título y qué cuenta como fijo los pone la página (/gastos-fijos).
    expect(section().queryByRole("heading")).toBeNull();
  });

  it("de un período de un mes, dice \"mes\"; sin gasto promedio, no dice qué parte es", () => {
    render(<FixedExpenses {...props} periodMonths={1} averageExpense={0} />);
    expect(section().getAllByRole("listitem")[0]).toHaveTextContent(/En 4 de 1 mes 5%/);
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

  it("mientras vuelve a poner uno, el botón dice «Volviendo…» y no deja enviar dos veces", async () => {
    let finish: (state: FixedExpenseState) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(section().getByText("Quitados (1)"));
    const restore = section().getByRole("button", { name: "Volver a poner Netflix en los gastos fijos" });
    await user.click(restore);
    await waitFor(() => expect(restore).toHaveTextContent("Volviendo…"));
    expect(restore).toBeDisabled();
    await user.click(restore);
    expect(action).toHaveBeenCalledTimes(1);
    finish({ error: "Ese egreso no está entre tus movimientos." });
    await waitFor(() => expect(restore).toBeEnabled());
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

    it("mientras agrega, el botón dice «Agregando…» y no deja enviar dos veces", async () => {
      let finish: (state: FixedExpenseState) => void = () => {};
      action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      const user = userEvent.setup();
      render(<FixedExpenses {...props} />);
      await user.selectOptions(await open(user), "Gimnasio");
      await user.click(section().getByRole("button", { name: "Agregar" }));
      const busy = await section().findByRole("button", { name: "Agregando…" });
      expect(busy).toBeDisabled();
      await user.click(busy);
      expect(action).toHaveBeenCalledTimes(1);
      finish({ error: "Ese egreso no está entre tus movimientos." });
      expect(await section().findByRole("button", { name: "Agregar" })).toBeEnabled();
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

describe("FixedExpenses · historial", () => {
  const toggle = (name: RegExp) => section().getByRole("button", { name });

  it("cerrado, cada gasto dice su último cambio; uno que nunca cambió, no", () => {
    render(<FixedExpenses {...props} />);
    expect(toggle(/^Historial de Arriendo/)).toHaveAttribute("aria-expanded", "false");
    expect(toggle(/^Historial de Arriendo/)).toHaveTextContent("5% desde marzo");
    expect(toggle(/^Historial de Seguro del carro/)).not.toHaveTextContent("desde");
    for (const panel of section().getAllByText("Historial del valor")) expect(panel).not.toBeVisible();
  });

  it("al tocarlo, cada cambio con la fecha, antes → ahora, la diferencia, su nota, y el primer pago", async () => {
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(toggle(/^Historial de Arriendo/));
    expect(toggle(/^Historial de Arriendo/)).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle(/^Historial de Arriendo/).getAttribute("aria-controls")!)!;
    const entries = within(panel).getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("5 de mar de 2026+$90.000,00 (+5%)$1.800.000,00 → $1.890.000,00“Subió con el IPC.”Editar nota del cambio del 5 de mar de 2026");
    expect(entries[1]).toHaveTextContent("5 de nov de 2025Primer pago$1.800.000,00");
    expect(within(entries[1]).queryByRole("button")).toBeNull();
    // Abierto, la descripción se lee completa (cerrado se corta con "…").
    expect(section().getByText("Arriendo")).toHaveClass("break-words");
    expect(section().getByText("Seguro del carro")).toHaveClass("truncate");
    await user.click(toggle(/^Historial de Arriendo/));
    expect(panel).not.toBeVisible();
    expect(section().getByText("Arriendo")).toHaveClass("truncate");
  });

  it("una baja, con el signo menos y el porcentaje", async () => {
    const user = userEvent.setup();
    const down = { arriendo: { entries: [entry("2026-03", 1700000, 1800000)], summary: { direction: "down" as const, text: "6% desde marzo" } } };
    render(<FixedExpenses {...props} histories={down} />);
    await user.click(toggle(/^Historial de Arriendo/));
    expect(section().getByText(/^−\$100\.000,00/)).toHaveTextContent("−$100.000,00 (−6%)");
  });

  it("agregar una nota: el campo con el foco, se envía con el gasto y el mes, se cierra y avisa", async () => {
    noteAction.mockResolvedValue({ message: "Se guardó la nota", tone: "success" });
    const user = userEvent.setup();
    const noNote = { ...HISTORIES, arriendo: { ...HISTORIES.arriendo, entries: [entry("2026-03", 1890000, 1800000), entry("2025-11", 1800000, null)] } };
    render(<FixedExpenses {...props} histories={noNote} />);
    await user.click(toggle(/^Historial de Arriendo/));
    await user.click(section().getByRole("button", { name: "Agregar nota del cambio del 5 de mar de 2026" }));
    const field = section().getByLabelText("Nota del cambio del 5 de mar de 2026");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("maxlength", "280");
    expect(field).toHaveClass("input");
    await user.type(field, "Subió con el IPC.");
    await user.click(section().getByRole("button", { name: "Guardar nota" }));
    expect(Object.fromEntries(noteAction.mock.calls[0][1])).toEqual({ description: "Arriendo", month: "2026-03", note: "Subió con el IPC." });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se guardó la nota");
    // El campo se cerró: el foco va al aviso (si no, el teclado quedaría en ninguna parte).
    expect(toast).toHaveFocus();
    expect(section().queryByLabelText(/^Nota del cambio/)).toBeNull();
  });

  it("mientras guarda la nota, «Guardando…» no deja enviar dos veces y Escape no la cierra", async () => {
    let finish: (state: FixedNoteState) => void = () => {};
    noteAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(toggle(/^Historial de Arriendo/));
    await user.click(section().getByRole("button", { name: "Editar nota del cambio del 5 de mar de 2026" }));
    await user.click(section().getByRole("button", { name: "Guardar nota" }));
    const busy = await section().findByRole("button", { name: "Guardando…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    await user.keyboard("{Escape}");
    expect(noteAction).toHaveBeenCalledTimes(1);
    expect(section().getByLabelText("Nota del cambio del 5 de mar de 2026")).toBeInTheDocument();
    finish({ error: "No se pudo guardar la nota." });
    expect(await section().findByRole("button", { name: "Guardar nota" })).toBeEnabled();
  });

  it("editar: trae la nota; \"Eliminar nota\" la manda vacía y avisa en rojo", async () => {
    noteAction.mockResolvedValue({ message: "Se borró la nota", tone: "removal" });
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(toggle(/^Historial de Arriendo/));
    await user.click(section().getByRole("button", { name: "Editar nota del cambio del 5 de mar de 2026" }));
    expect(section().getByLabelText("Nota del cambio del 5 de mar de 2026")).toHaveValue("Subió con el IPC.");
    await user.click(section().getByRole("button", { name: "Eliminar nota" }));
    expect(Object.fromEntries(noteAction.mock.calls[0][1])).toMatchObject({ note: "" });
    expect(await findToast()).toHaveAttribute("data-tone", "removal");
  });

  it("una nota nueva no ofrece borrar; Cancelar (o Escape) cierra sin enviar y el foco vuelve al botón", async () => {
    const user = userEvent.setup();
    const noNote = { ...HISTORIES, arriendo: { ...HISTORIES.arriendo, entries: [entry("2026-03", 1890000, 1800000)] } };
    render(<FixedExpenses {...props} histories={noNote} />);
    await user.click(toggle(/^Historial de Arriendo/));
    const add = () => section().getByRole("button", { name: "Agregar nota del cambio del 5 de mar de 2026" });
    await user.click(add());
    expect(section().queryByRole("button", { name: "Eliminar nota" })).toBeNull();
    await user.click(section().getAllByRole("button", { name: "Cancelar" })[0]);
    expect(section().queryByLabelText(/^Nota del cambio/)).toBeNull();
    expect(add()).toHaveFocus();

    await user.click(add());
    await user.type(section().getByLabelText("Nota del cambio del 5 de mar de 2026"), "A medias{Escape}");
    expect(section().queryByLabelText(/^Nota del cambio/)).toBeNull();
    expect(add()).toHaveFocus();
    expect(noteAction).not.toHaveBeenCalled();
  });

  it("un error del servidor queda debajo del campo", async () => {
    noteAction.mockResolvedValue({ error: "Máximo 280 caracteres.", field: "note" });
    const user = userEvent.setup();
    render(<FixedExpenses {...props} />);
    await user.click(toggle(/^Historial de Arriendo/));
    await user.click(section().getByRole("button", { name: "Editar nota del cambio del 5 de mar de 2026" }));
    await user.click(section().getByRole("button", { name: "Guardar nota" }));
    const field = section().getByLabelText("Nota del cambio del 5 de mar de 2026");
    expect(await section().findByText("Máximo 280 caracteres.")).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Máximo 280 caracteres.");
  });

  it("sin historial (no debería pasar), el desplegable queda vacío sin fallar", async () => {
    const user = userEvent.setup();
    render(<FixedExpenses {...props} histories={{}} />);
    await user.click(toggle(/^Historial de Arriendo/));
    const panel = document.getElementById(toggle(/^Historial de Arriendo/).getAttribute("aria-controls")!)!;
    expect(within(panel).getByText("Historial del valor")).toBeVisible();
    expect(within(panel).queryAllByRole("listitem")).toEqual([]);
  });
});


describe("FixedExpenses · en inglés", () => {
  it("la lista, el total, el historial con sus notas y los quitados, en inglés", async () => {
    render(<FixedExpenses {...props} />, { english: true });
    const bills = within(screen.getByRole("region", { name: "Bills" }));
    expect(bills.getByText("Total per month")).toBeVisible();
    expect(bills.getByText("−$2,750,000.00")).toBeVisible();
    expect(bills.getByText("They're 100% of your average monthly spending.")).toBeVisible();
    expect(bills.getByRole("button", { name: "Remove Arriendo from your bills" })).toBeVisible();
    const rent = bills.getByRole("button", { name: /^History of Arriendo In 4 of 12 months/ });
    expect(bills.getByText(/· Added by you/)).toBeVisible();
    await userEvent.click(rent);
    // El historial que se abrió (el de cada gasto está en la página, oculto mientras está cerrado).
    const history = within(document.getElementById(rent.getAttribute("aria-controls")!)!);
    expect(history.getByText("Amount history")).toBeVisible();
    expect(history.getByText("First payment")).toBeVisible();
    expect(history.getByText("Mar 5, 2026")).toBeVisible();
    await userEvent.click(bills.getByRole("button", { name: "Edit note for the change on Mar 5, 2026" }));
    expect(bills.getByRole("textbox", { name: "Note for the change on Mar 5, 2026" })).toHaveAttribute("placeholder", "Why it changed, for example");
    expect(bills.getByRole("button", { name: "Delete note" })).toBeVisible();
    expect(bills.getByRole("button", { name: "Save note" })).toBeVisible();
    await userEvent.click(bills.getByText("Removed (1)"));
    expect(bills.getByRole("button", { name: "Put Netflix back in your bills" })).toHaveTextContent("Put back");
  });

  it("agregar un gasto fijo, con su mensaje en inglés", async () => {
    render(<FixedExpenses {...props} />, { english: true });
    await userEvent.click(screen.getByRole("button", { name: "Add a bill" }));
    expect(screen.getByRole("option", { name: "Pick an expense from the period" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Pick an expense.")).toBeVisible();
  });

  it("sin gastos fijos", () => {
    render(<FixedExpenses {...props} items={[]} />, { english: true });
    expect(screen.getByText("There are no expenses that repeat every month yet.")).toBeVisible();
  });
});
