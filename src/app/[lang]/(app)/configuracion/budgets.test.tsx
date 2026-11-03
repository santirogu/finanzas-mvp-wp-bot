import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetState } from "@/modules/budgets/actions";
import type { BudgetRow } from "@/modules/budgets/progress";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

const save = vi.hoisted(() => vi.fn<(prev: BudgetState, data: FormData) => Promise<BudgetState>>());
const remove = vi.hoisted(() => vi.fn<(prev: BudgetState, data: FormData) => Promise<BudgetState>>());
vi.mock("@/modules/budgets/actions", () => ({ saveBudgetAction: save, removeBudgetAction: remove }));

const { Budgets } = await import("./budgets");

const row = (categoryId: string, name: string, over = false): BudgetRow => ({
  categoryId,
  name,
  emoji: "🛒",
  level: over ? "over" : "near",
  spentOf: over ? "$310.000,00 de $300.000,00" : "$410.000,00 de $500.000,00",
  share: over ? "103 %" : "82 %",
  bar: over ? 100 : 82,
  note: over ? "Te pasaste por $10.000,00" : "Te quedan $90.000,00",
  archived: null,
  amountInput: over ? "300.000,00" : "500.000,00",
});
const ROWS = [row("c1", "Transporte", true), row("c2", "Mercado")];
const OPTIONS = [
  { id: "c3", name: "Salud", emoji: "🩺" },
  { id: "c4", name: "Ropa", emoji: "👟" },
];

const section = () => within(screen.getByRole("region", { name: "Presupuestos" }));
const dialog = () => within(screen.getByRole("dialog"));

// jsdom no abre ventanas modales: basta con marcarla abierta y avisar al cerrarla.
beforeEach(() => {
  save.mockReset();
  remove.mockReset();
});

describe("Budgets", () => {
  it("cada presupuesto con cuánto lleva, el porcentaje y cuánto le queda o por cuánto se pasó (bajo cómo va el mes)", () => {
    render(<Budgets rows={ROWS} options={OPTIONS} month="octubre" />);
    expect(section().getByRole("heading", { level: 3, name: "Cómo vas en octubre" })).toBeVisible();
    const items = section().getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Transporte103.%\$310\.000,00 de \$300\.000,00Te pasaste por \$10\.000,00CambiarQuitar/);
    expect(within(items[0]).getByText("Te pasaste por $10.000,00")).toHaveClass("text-danger");
    expect(items[1]).toHaveTextContent(/Mercado82.%\$410\.000,00 de \$500\.000,00Te quedan \$90\.000,00/);
  });

  it("sin presupuestos lo dice; sin categorías libres, no ofrece agregar", () => {
    const { rerender } = render(<Budgets rows={[]} options={OPTIONS} month="octubre" />);
    expect(section().getByText(/^Todavía no tienes presupuestos\./)).toBeVisible();
    expect(section().getByRole("button", { name: "Agregar un presupuesto" })).toBeVisible();
    rerender(<Budgets rows={ROWS} options={[]} month="octubre" />);
    expect(section().queryByRole("button", { name: "Agregar un presupuesto" })).toBeNull();
  });
});

describe("Budgets · agregar", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<Budgets rows={ROWS} options={OPTIONS} month="octubre" />);
    await user.click(section().getByRole("button", { name: "Agregar un presupuesto" }));
  };

  it("la ventana trae solo las categorías libres, con el foco en la categoría", async () => {
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByRole("dialog", { name: "Agregar un presupuesto" })).toHaveAccessibleDescription(
      "Vale todos los meses hasta que lo cambies o lo quites.",
    );
    expect(dialog().getByLabelText("Categoría")).toHaveFocus();
    expect(dialog().getAllByRole("option").map((option) => option.textContent)).toEqual(["Elige una categoría", "🩺 Salud", "👟 Ropa"]);
  });

  it("sin categoría ni monto no envía y lo dice debajo de cada campo", async () => {
    const user = userEvent.setup();
    await open(user);
    await user.click(dialog().getByRole("button", { name: "Guardar" }));
    expect(save).not.toHaveBeenCalled();
    expect(dialog().getByLabelText("Categoría")).toHaveAccessibleDescription("Elige una categoría.");
    expect(dialog().getByLabelText("Monto por mes")).toHaveAccessibleDescription("Escribe el monto.");
  });

  it("manda la categoría y el monto (con sus puntos); se cierra y avisa en verde con el foco", async () => {
    save.mockResolvedValue({ message: "Se guardó el presupuesto de Salud: $200.000,00 al mes", tone: "success" });
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(dialog().getByLabelText("Categoría"), "c3");
    await user.type(dialog().getByLabelText("Monto por mes"), "200000");
    expect(dialog().getByLabelText("Monto por mes")).toHaveValue("200.000");
    await user.click(dialog().getByRole("button", { name: "Guardar" }));
    expect(Object.fromEntries(save.mock.calls[0][1])).toEqual({ categoryId: "c3", amount: "200.000,00" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se guardó el presupuesto de Salud: $200.000,00 al mes");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el error del servidor va junto a su campo; mientras guarda, el botón espera", async () => {
    let finish!: (state: BudgetState) => void;
    save.mockResolvedValueOnce({ error: "El monto no puede pasar de $99.999.999.999,99.", field: "amount" });
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(dialog().getByLabelText("Categoría"), "c4");
    await user.type(dialog().getByLabelText("Monto por mes"), "1");
    await user.click(dialog().getByRole("button", { name: "Guardar" }));
    expect(await dialog().findByText("El monto no puede pasar de $99.999.999.999,99.")).toBeVisible();
    expect(dialog().getByLabelText("Monto por mes")).toHaveAttribute("aria-invalid", "true");
    // Lo escrito sigue ahí.
    expect(dialog().getByLabelText("Categoría")).toHaveValue("c4");
    expect(dialog().getByLabelText("Monto por mes")).toHaveValue("1,00");

    save.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await user.click(dialog().getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(dialog().getByRole("button", { name: "Guardando…" })).toBeDisabled());
    finish({ message: "Se guardó", tone: "success" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Budgets · cambiar y quitar", () => {
  it("Cambiar abre la ventana con el monto de ahora (el foco, ahí) y manda esa categoría", async () => {
    save.mockResolvedValue({ message: "Se cambió el presupuesto de Mercado: $600.000,00 al mes", tone: "success" });
    const user = userEvent.setup();
    render(<Budgets rows={ROWS} options={OPTIONS} month="octubre" />);
    await user.click(section().getByRole("button", { name: "Cambiar el presupuesto de Mercado" }));
    expect(screen.getByRole("dialog", { name: "Cambiar el presupuesto de Mercado" })).toBeVisible();
    expect(dialog().queryByLabelText("Categoría")).toBeNull();
    expect(dialog().getByLabelText("Monto por mes")).toHaveValue("500.000,00");
    expect(dialog().getByLabelText("Monto por mes")).toHaveFocus();
    await user.clear(dialog().getByLabelText("Monto por mes"));
    await user.type(dialog().getByLabelText("Monto por mes"), "600000");
    await user.click(dialog().getByRole("button", { name: "Guardar" }));
    expect(Object.fromEntries(save.mock.calls[0][1])).toEqual({ categoryId: "c2", amount: "600.000,00" });
    expect(await findToast()).toHaveTextContent("Se cambió el presupuesto de Mercado");
  });

  it("Quitar manda la categoría y avisa en rojo con el foco; si falla, lo dice en la fila", async () => {
    remove.mockResolvedValueOnce({ error: "Ese presupuesto ya no existe." });
    const user = userEvent.setup();
    render(<Budgets rows={ROWS} options={OPTIONS} month="octubre" />);
    await user.click(section().getByRole("button", { name: "Quitar el presupuesto de Transporte" }));
    expect(Object.fromEntries(remove.mock.calls[0][1])).toEqual({ categoryId: "c1" });
    expect(await section().findByRole("alert")).toHaveTextContent("Ese presupuesto ya no existe.");

    remove.mockResolvedValueOnce({ message: "Se quitó el presupuesto de Transporte", tone: "removal" });
    await user.click(section().getByRole("button", { name: "Quitar el presupuesto de Transporte" }));
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se quitó el presupuesto de Transporte");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
  });
});

describe("Budgets · en inglés", () => {
  it("los textos y la ventana", async () => {
    const user = userEvent.setup();
    render(<Budgets rows={[]} options={OPTIONS} month="October" />, { english: true });
    const card = within(screen.getByRole("region", { name: "Budgets" }));
    expect(card.getByText(/^You don't have budgets yet\./)).toBeVisible();
    await user.click(card.getByRole("button", { name: "Add a budget" }));
    expect(dialog().getByLabelText("Category")).toBeVisible();
    expect(dialog().getByLabelText("Amount per month")).toBeVisible();
    await user.click(dialog().getByRole("button", { name: "Save" }));
    expect(dialog().getByLabelText("Amount per month")).toHaveAccessibleDescription("Enter the amount.");
  });
});
