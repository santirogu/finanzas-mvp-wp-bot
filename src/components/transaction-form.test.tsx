import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/transactions/actions";

// La Server Action se simula: aquí se prueba el formulario (lo que envía y cómo muestra la
// respuesta). La acción tiene sus propias pruebas de integración.
const action = vi.hoisted(() => vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>());
const update = vi.hoisted(() => vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>());
vi.mock("@/modules/transactions/actions", () => ({
  createTransactionAction: action,
  updateTransactionAction: update,
}));

const { TransactionForm } = await import("./transaction-form");

const CATEGORIES = [
  { id: "c-ropa", name: "Ropa", emoji: "👟" },
  { id: "c-mercado", name: "Mercado", emoji: "🛒" },
];

function renderForm(type: "income" | "expense" = "expense") {
  return render(<TransactionForm type={type} categories={CATEGORIES} today="2026-10-14" />);
}

beforeEach(() => {
  action.mockReset();
  update.mockReset();
});

describe("TransactionForm", () => {
  it("tiene un título y un botón según el tipo", () => {
    const { unmount } = renderForm("income");
    expect(screen.getByRole("heading", { name: "Nuevo ingreso" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Registrar ingreso" })).toBeEnabled();
    unmount();

    renderForm("expense");
    expect(screen.getByRole("heading", { name: "Nuevo egreso" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Registrar egreso" })).toBeEnabled();
  });

  it("formatea el monto con separadores de miles mientras se escribe e ignora lo que no es un dígito", async () => {
    renderForm();
    const amount = screen.getByLabelText(/Monto/);
    await userEvent.type(amount, "500000");
    expect(amount).toHaveValue("500.000");

    await userEvent.clear(amount);
    await userEvent.type(amount, "-1a2");
    expect(amount).toHaveValue("12");

    await userEvent.clear(amount);
    await userEvent.type(amount, "x");
    expect(amount).toHaveValue("");
  });

  it("ofrece 'Sin categoría' y las categorías con su emoji; la fecha es hoy y no permite fechas futuras", () => {
    renderForm();
    const options = screen.getAllByRole("option").map((o) => [o.textContent, o.getAttribute("value")]);
    expect(options).toEqual([
      ["Sin categoría", ""],
      ["👟 Ropa", "c-ropa"],
      ["🛒 Mercado", "c-mercado"],
    ]);
    const date = screen.getByLabelText("Fecha");
    expect(date).toHaveValue("2026-10-14");
    expect(date).toHaveAttribute("max", "2026-10-14");
  });

  it("envía lo escrito a la Server Action y avisa cuando se registró", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-ropa");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await screen.findByText("✓ Egreso registrado")).toBeVisible();
    const data = action.mock.calls[0][1];
    expect(Object.fromEntries(data)).toEqual({
      type: "expense",
      amount: "500.000",
      description: "Zapatos",
      categoryId: "c-ropa",
      occurredOn: "2026-10-14",
    });
    // Queda listo para registrar el siguiente.
    expect(screen.getByLabelText(/Monto/)).toHaveFocus();
  });

  it("muestra los errores de cada campo y conserva lo escrito", async () => {
    action.mockResolvedValue({
      ok: false,
      fieldErrors: { amount: "Ingresa un monto mayor que cero" },
      values: { amount: "0", description: "Zapatos", categoryId: "c-mercado", occurredOn: "2026-10-01" },
    });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "0");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeVisible();
    expect(screen.getByLabelText("Descripción")).toHaveValue("Zapatos");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-01");
    expect(screen.queryByText(/✓/)).not.toBeInTheDocument();
  });

  it("tras un error también conserva la categoría elegida", async () => {
    action.mockResolvedValue({
      ok: false,
      fieldErrors: { amount: "Ingresa un monto mayor que cero" },
      values: { amount: "0", description: "Zapatos", categoryId: "c-mercado", occurredOn: "2026-10-14" },
    });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "0");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-mercado");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeVisible();
    expect(screen.getByLabelText("Categoría")).toHaveValue("c-mercado");
  });

  it("después de registrar, la categoría vuelve a 'Sin categoría' para el siguiente", async () => {
    action.mockResolvedValueOnce({
      ok: false,
      fieldErrors: { amount: "Ingresa un monto mayor que cero" },
      values: { amount: "0", description: "Zapatos", categoryId: "c-ropa", occurredOn: "2026-10-14" },
    });
    action.mockResolvedValueOnce({ ok: true, message: "Egreso registrado" });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "0");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-ropa");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeVisible();
    expect(screen.getByLabelText("Categoría")).toHaveValue("c-ropa");

    await userEvent.type(screen.getByLabelText(/Monto/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(await screen.findByText("✓ Egreso registrado")).toBeVisible();
    expect(screen.getByLabelText("Categoría")).toHaveValue("");
  });

  it("mientras guarda, desactiva el botón para no registrar dos veces", async () => {
    let finish!: (state: FormState) => void;
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm("income");

    await userEvent.type(screen.getByLabelText(/Monto/), "1000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Venta");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    finish({ ok: true, message: "Ingreso registrado" });
    expect(await screen.findByRole("button", { name: "Registrar ingreso" })).toBeEnabled();
  });
});

describe("TransactionForm · editar", () => {
  const TX = {
    id: "00000000-0000-4000-8000-000000000001",
    amount: 500000,
    description: "Zapatos",
    categoryId: "c-ropa",
    occurredOn: "2026-10-10",
  };
  const renderEdit = () =>
    render(
      <TransactionForm
        type="expense"
        categories={CATEGORIES}
        today="2026-10-14"
        transaction={TX}
        cancelHref="/egresos"
      />,
    );

  it("muestra el movimiento con sus datos, el monto con separadores", () => {
    renderEdit();
    expect(screen.getByRole("heading", { name: "Editar egreso" })).toBeVisible();
    expect(screen.getByLabelText(/Monto/)).toHaveValue("500.000");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Zapatos");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c-ropa");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-10");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/egresos");
  });

  it("envía los cambios con el id a la acción de editar (no a la de registrar)", async () => {
    update.mockResolvedValue({ ok: false, message: "No encontramos ese movimiento" });
    renderEdit();

    const amount = screen.getByLabelText(/Monto/);
    await userEvent.clear(amount);
    await userEvent.type(amount, "450000");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-mercado");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("No encontramos ese movimiento")).toBeVisible();
    expect(action).not.toHaveBeenCalled();
    expect(Object.fromEntries(update.mock.calls[0][1])).toEqual({
      type: "expense",
      id: TX.id,
      amount: "450.000",
      description: "Zapatos",
      categoryId: "c-mercado",
      occurredOn: "2026-10-10",
    });
  });

  it("si hay errores, conserva lo escrito en vez de volver a los datos guardados", async () => {
    update.mockResolvedValue({
      ok: false,
      fieldErrors: { amount: "Ingresa un monto mayor que cero" },
      values: { amount: "0", description: "Otra cosa", categoryId: "c-mercado", occurredOn: "2026-10-12" },
    });
    renderEdit();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeVisible();
    expect(screen.getByLabelText("Descripción")).toHaveValue("Otra cosa");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c-mercado");
  });

  it("un movimiento sin categoría se muestra con 'Sin categoría'", () => {
    render(<TransactionForm type="income" categories={CATEGORIES} today="2026-10-14" transaction={{ ...TX, categoryId: null }} />);
    expect(screen.getByRole("heading", { name: "Editar ingreso" })).toBeVisible();
    expect(screen.getByLabelText("Categoría")).toHaveValue("");
    expect(screen.queryByRole("link", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("al registrar uno nuevo no hay id ni botón de cancelar", () => {
    const { container } = renderForm();
    expect(container.querySelector('input[name="id"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Cancelar" })).not.toBeInTheDocument();
  });
});
