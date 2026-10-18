import { render as renderAlone, screen, within } from "@testing-library/react";
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
const { Toaster } = await import("./toaster");

// Como en la app: lo que salió bien va en un aviso emergente del Toaster.
const render = (ui: React.ReactElement) => renderAlone(<Toaster>{ui}</Toaster>);
const toast = (message: string) => within(screen.getByRole("region", { name: "Avisos" })).findByText(message, { exact: true });

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

  it("formatea el monto con separadores de miles mientras se escribe e ignora lo que no es un dígito ni un separador", async () => {
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

  it("acepta centavos después de la coma, máximo dos, con el teclado decimal", async () => {
    renderForm();
    const amount = screen.getByLabelText(/Monto/);
    expect(amount).toHaveAttribute("inputmode", "decimal");
    await userEvent.type(amount, "45900,505");
    expect(amount).toHaveValue("45.900,50");

    // Borrar los centavos y la coma deja el monto entero.
    await userEvent.type(amount, "{Backspace}{Backspace}{Backspace}");
    expect(amount).toHaveValue("45.900");
    // Borrar un dígito recalcula los puntos de miles (no los vuelve centavos).
    await userEvent.type(amount, "{Backspace}");
    expect(amount).toHaveValue("4.590");
  });

  it("un punto al final también abre los centavos (el teclado en inglés no tiene coma)", async () => {
    renderForm();
    const amount = screen.getByLabelText(/Monto/);
    await userEvent.type(amount, "45900.5");
    expect(amount).toHaveValue("45.900,5");
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

  it("una categoría archivada (la que ya tenía el movimiento) se marca como tal", () => {
    render(
      <TransactionForm
        type="expense"
        categories={[...CATEGORIES, { id: "c-viejo", name: "Videojuegos", emoji: "🎮", archived: true }]}
        today="2026-10-14"
      />,
    );
    expect(screen.getByRole("option", { name: "🎮 Videojuegos (archivada)" })).toHaveAttribute("value", "c-viejo");
    expect(screen.getByRole("option", { name: "👟 Ropa" })).toBeInTheDocument();
  });

  it("envía el monto con sus centavos", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "25900,5");
    await userEvent.type(screen.getByLabelText("Descripción"), "Almuerzo");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await toast("Egreso registrado")).toBeVisible();
    expect(action.mock.calls[0][1].get("amount")).toBe("25.900,5");
  });

  it("envía lo escrito a la Server Action y avisa cuando se registró (aviso verde)", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-ropa");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await toast("Egreso registrado")).toBeVisible();
    expect((await toast("Egreso registrado")).closest("li")).toHaveAttribute("data-tone", "success");
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

  it.each([
    ["en el mes de la lista, no dice más", "2026-10-14", { start: "2026-10-01", end: "2026-11-01" }, "Egreso registrado"],
    ["sin lista al lado, tampoco", "2026-09-30", undefined, "Egreso registrado"],
    ["en otro mes, dice en cuál quedó", "2026-09-30", { start: "2026-10-01", end: "2026-11-01" }, "Egreso registrado en septiembre de 2026"],
    ["el primer día del mes siguiente ya es otro mes", "2026-11-01", { start: "2026-10-01", end: "2026-11-01" }, "Egreso registrado en noviembre de 2026"],
    ["mirando septiembre, uno de hoy queda en octubre", "2026-10-14", { start: "2026-09-01", end: "2026-10-01" }, "Egreso registrado en octubre de 2026"],
  ])("al registrar, %s", async (_case, occurredOn, listMonth, message) => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado", occurredOn });
    render(<TransactionForm type="expense" categories={CATEGORIES} today="2026-10-14" listMonth={listMonth} />);

    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await toast(message)).toBeVisible();
  });

  it("el aviso sale una sola vez, aunque la página se vuelva a dibujar (p. ej. al cambiar de mes)", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado", occurredOn: "2026-10-14" });
    const page = (listMonth: { start: string; end: string }) => (
      <Toaster>
        <TransactionForm type="expense" categories={CATEGORIES} today="2026-10-14" listMonth={listMonth} />
      </Toaster>
    );
    const { rerender } = renderAlone(page({ start: "2026-10-01", end: "2026-11-01" }));
    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    await toast("Egreso registrado");

    rerender(page({ start: "2026-09-01", end: "2026-10-01" }));

    expect(screen.getByRole("region", { name: "Avisos" }).querySelectorAll("li")).toHaveLength(1);
  });

  it("un error que no es de un campo se queda en el formulario, en rojo (no es un aviso emergente)", async () => {
    action.mockResolvedValue({ ok: false, message: "No pudimos guardar el movimiento" });
    renderForm();
    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText("Descripción"), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    const error = await screen.findByText("No pudimos guardar el movimiento");
    expect(error.closest("form")).not.toBeNull();
    expect(error).toHaveClass("text-danger");
    expect(screen.getByRole("region", { name: "Avisos" }).querySelectorAll("li")).toHaveLength(0);
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
    expect(screen.getByRole("region", { name: "Avisos" }).querySelectorAll("li")).toHaveLength(0);
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
    expect(await toast("Egreso registrado")).toBeVisible();
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

  it("muestra los centavos del movimiento guardado", () => {
    render(
      <TransactionForm
        type="expense"
        categories={CATEGORIES}
        today="2026-10-14"
        transaction={{ ...TX, amount: 45900.5 }}
        cancelHref="/egresos"
      />,
    );
    expect(screen.getByLabelText(/Monto/)).toHaveValue("45.900,50");
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

describe("TransactionForm · errores de los campos en español", () => {
  it("sin monto ni descripción lo dice debajo de cada uno, sin enviar", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Monto/)).toHaveAccessibleDescription("Escribe el monto.");
    expect(screen.getByLabelText("Descripción")).toHaveAccessibleDescription('Escribe una descripción, por ejemplo "Almuerzo".');
    expect(screen.getByLabelText(/^Monto/)).toHaveFocus();
  });

  it("sin fecha, o con una futura, lo dice", async () => {
    renderForm();
    const date = screen.getByLabelText("Fecha");
    await userEvent.clear(date);
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(date).toHaveAccessibleDescription("Elige la fecha.");
    await userEvent.type(date, "2026-10-20");
    expect(date).toHaveAccessibleDescription("La fecha no puede ser después de hoy.");
  });

  it("los errores del servidor también van debajo de su campo, enlazados", async () => {
    action.mockResolvedValue({ ok: false, fieldErrors: { amount: "Ingresa un monto mayor que cero" }, values: { amount: "0", description: "X" } });
    renderForm();
    await userEvent.type(screen.getByLabelText(/^Monto/), "0");
    await userEvent.type(screen.getByLabelText("Descripción"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto/)).toHaveAccessibleDescription("Ingresa un monto mayor que cero");
    expect(screen.getByLabelText(/^Monto/)).toHaveAttribute("aria-invalid", "true");
  });
});

