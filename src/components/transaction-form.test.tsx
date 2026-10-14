import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/transactions/actions";

// La Server Action se simula: aquí se prueba el formulario (lo que envía y cómo muestra la
// respuesta). La acción tiene sus propias pruebas de integración.
const action = vi.hoisted(() => vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>());
vi.mock("@/modules/transactions/actions", () => ({ createTransactionAction: action }));

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

  // Falla conocida (confirmada también en Chromium): React 19 reinicia el formulario al terminar
  // la acción y un <select> no toma un defaultValue nuevo después de montarse, así que tras un
  // error la categoría vuelve a "Sin categoría". Se corrige en una rama fix/; luego quitar `.fails`.
  it.fails("tras un error también conserva la categoría elegida", async () => {
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
