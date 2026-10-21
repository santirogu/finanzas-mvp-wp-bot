import { act, createEvent, fireEvent, render as renderAlone, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/modules/transactions/actions";
import { InEnglish } from "../../test/locale";

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

  it("al salir del campo, el monto se completa con sus dos decimales (el ejemplo ya los muestra)", async () => {
    renderForm();
    const amount = screen.getByLabelText(/Monto/);
    expect(amount).toHaveAttribute("placeholder", "500.000,00");
    await userEvent.type(amount, "500000");
    await userEvent.tab();
    expect(amount).toHaveValue("500.000,00");

    await userEvent.clear(amount);
    await userEvent.type(amount, "45900,5");
    await userEvent.tab();
    expect(amount).toHaveValue("45.900,50");

    // Vacío sigue vacío: el campo avisa que falta (no inventa un 0,00).
    await userEvent.clear(amount);
    await userEvent.tab();
    expect(amount).toHaveValue("");
  });

  it("los campos obligatorios llevan un asterisco rojo que el lector de pantalla no lee", () => {
    const { container } = renderForm();
    for (const name of ["Monto", "Descripción", "Fecha"]) {
      const label = screen.getByText(name, { exact: true });
      expect(label).toHaveTextContent(`${name}*`);
      expect(label.querySelector("[aria-hidden]")).toHaveClass("text-danger");
    }
    // El nombre que lee el lector de pantalla no lleva el asterisco, y el campo se anuncia como obligatorio.
    expect(screen.getByRole("textbox", { name: "Descripción" })).toBeRequired();
    // La categoría es opcional: sin asterisco.
    expect(screen.getByText("Categoría", { exact: true })).toHaveTextContent(/^Categoría$/);
    // La explicación del asterisco se ve, pero el lector de pantalla no la necesita.
    expect(within(container).getByText("Obligatorio").closest("[aria-hidden]")).not.toBeNull();
  });

  it("propone la fecha que le pasan (la del mes que se ve) y no deja fechas después de hoy", () => {
    render(<TransactionForm type="expense" categories={CATEGORIES} today="2026-10-14" defaultDate="2026-09-14" />);
    expect(screen.getByLabelText(/^Fecha/)).toHaveValue("2026-09-14");
    expect(screen.getByLabelText(/^Fecha/)).toHaveAttribute("max", "2026-10-14");
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
    const date = screen.getByLabelText(/^Fecha/);
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Almuerzo");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await toast("Egreso registrado")).toBeVisible();
    // Al salir del campo se completó con sus dos decimales.
    expect(action.mock.calls[0][1].get("amount")).toBe("25.900,50");
  });

  it("envía lo escrito a la Server Action y avisa cuando se registró (aviso verde)", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    renderForm();

    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c-ropa");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await toast("Egreso registrado")).toBeVisible();
    expect((await toast("Egreso registrado")).closest("li")).toHaveAttribute("data-tone", "success");
    const data = action.mock.calls[0][1];
    expect(Object.fromEntries(data)).toEqual({
      type: "expense",
      amount: "500.000,00",
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    await toast("Egreso registrado");

    rerender(page({ start: "2026-09-01", end: "2026-10-01" }));

    expect(screen.getByRole("region", { name: "Avisos" }).querySelectorAll("li")).toHaveLength(1);
  });

  it("un error que no es de un campo se queda en el formulario, en rojo (no es un aviso emergente)", async () => {
    action.mockResolvedValue({ ok: false, message: "No pudimos guardar el movimiento" });
    renderForm();
    await userEvent.type(screen.getByLabelText(/Monto/), "500000");
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));

    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeVisible();
    expect(screen.getByLabelText(/^Descripción/)).toHaveValue("Zapatos");
    expect(screen.getByLabelText(/^Fecha/)).toHaveValue("2026-10-01");
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Zapatos");
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "Venta");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    finish({ ok: true, message: "Ingreso registrado" });
    expect(await screen.findByRole("button", { name: "Registrar ingreso" })).toBeEnabled();
  });
});

describe("TransactionForm · sugerencias de la descripción", () => {
  const SUGGESTIONS = [
    { description: "Mercado del barrio", categoryId: "c-mercado" },
    { description: "Tenis", categoryId: "c-ropa" },
    { description: "Regalo", categoryId: null },
    { description: "Vieja", categoryId: "c-archivada" },
  ];
  const renderSuggesting = (categories: Parameters<typeof TransactionForm>[0]["categories"] = CATEGORIES) =>
    render(<TransactionForm type="expense" categories={categories} today="2026-10-14" suggestions={SUGGESTIONS} />);
  const description = () => screen.getByRole("combobox", { name: "Descripción" });
  const category = () => screen.getByLabelText("Categoría");

  // La lista que abre el campo (aria-controls): está en la página, oculta (`hidden`) mientras no hay nada que sugerir.
  const listbox = () => document.getElementById(description().getAttribute("aria-controls")!)!;
  const options = () => within(listbox()).queryAllByRole("option", { hidden: true }).map((o) => o.textContent);

  it("al escribir, muestra debajo las que ya usó que coinciden, con la parte que coincide y su categoría", async () => {
    renderSuggesting();
    expect(listbox()).not.toBeVisible();
    expect(description()).toHaveAttribute("aria-expanded", "false");
    expect(description()).toHaveAttribute("autocomplete", "off");

    await userEvent.type(description(), "ba");
    expect(screen.getByRole("listbox", { name: "Descripciones que ya usaste" })).toBe(listbox());
    expect(listbox()).toBeVisible();
    expect(description()).toHaveAttribute("aria-expanded", "true");
    expect(description()).toHaveAttribute("aria-controls", listbox().id);
    // Una palabra de "Mercado del barrio" empieza igual (el orden entre grupos lo prueba src/lib/suggestions.test.ts).
    expect(options()).toEqual(["Mercado del barrio🛒 Mercado"]);
    const [first] = within(listbox()).getAllByRole("option");
    expect(within(first).getByText("ba")).toHaveClass("font-semibold");
  });

  it("el toque en una sugerencia no se cancela (Safari no mandaría su click): el foco se conserva en mousedown", async () => {
    renderSuggesting();
    await userEvent.type(description(), "ba");
    const [option] = within(listbox()).getAllByRole("option");
    const pointerDown = createEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent(option, pointerDown);
    expect(pointerDown.defaultPrevented).toBe(false);
    const mouseDown = createEvent.mouseDown(option);
    fireEvent(option, mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("pasar por encima marca la opción solo con el mouse, no con el dedo", async () => {
    renderSuggesting();
    await userEvent.type(description(), "ba");
    const [option] = within(listbox()).getAllByRole("option");
    fireEvent.pointerEnter(option, { pointerType: "touch" });
    expect(option).toHaveAttribute("aria-selected", "false");
    fireEvent.pointerEnter(option, { pointerType: "mouse" });
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("a mitad de palabra no sugiere nada (\"rr\" no trae \"Mercado del barrio\")", async () => {
    renderSuggesting();
    await userEvent.type(description(), "rr");
    expect(listbox()).not.toBeVisible();
    expect(description()).toHaveAttribute("aria-expanded", "false");
  });

  it("sin sugerencias (o al editar) es un campo normal", () => {
    renderForm();
    const input = screen.getByRole("textbox", { name: "Descripción" });
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("autocomplete");
    expect(screen.queryByRole("listbox", { hidden: true })).toBeNull();
  });

  it("con las flechas se recorre (y da la vuelta), Enter elige sin enviar el formulario y propone la categoría", async () => {
    const withT = ["Taxi", "Tenis", "Tinto", "Pago de tarjeta"].map((d) => ({ description: d, categoryId: d === "Tenis" ? "c-ropa" : null }));
    render(<TransactionForm type="expense" categories={CATEGORIES} today="2026-10-14" suggestions={withT} />);
    await userEvent.type(description(), "t");
    // Las que empiezan por "t" y, después, la que tiene una palabra que empieza por "t".
    expect(options()).toEqual(["Taxi", "Tenis👟 Ropa", "Tinto", "Pago de tarjeta"]);
    await userEvent.keyboard("{ArrowDown}");
    const marked = () => description().getAttribute("aria-activedescendant");
    expect(marked()).toBe(within(listbox()).getAllByRole("option")[0].id);
    expect(within(listbox()).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    // Desde la primera, arriba da la vuelta a la última, y abajo desde la última vuelve a la primera.
    await userEvent.keyboard("{ArrowUp}");
    expect(marked()).toBe(within(listbox()).getAllByRole("option")[3].id);
    await userEvent.keyboard("{ArrowDown}");
    expect(marked()).toBe(within(listbox()).getAllByRole("option")[0].id);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    // (La segunda: Tenis.)
    expect(description()).toHaveValue("Tenis");
    expect(category()).toHaveValue("c-ropa");
    expect(listbox()).not.toBeVisible();
    expect(action).not.toHaveBeenCalled();
  });

  it("con Escape se cierra, y con un toque (o clic) elige", async () => {
    renderSuggesting();
    await userEvent.type(description(), "merc");
    await userEvent.keyboard("{Escape}");
    expect(listbox()).not.toBeVisible();

    await userEvent.type(description(), "a");
    await userEvent.click(within(listbox()).getByRole("option", { name: /Mercado del barrio/ }));
    expect(description()).toHaveValue("Mercado del barrio");
    expect(description()).toHaveFocus();
    expect(category()).toHaveValue("c-mercado");
    expect(listbox()).not.toBeVisible();
  });

  it("con Tab se cierra enseguida (no tapa el campo que recibe el foco)", async () => {
    renderSuggesting();
    await userEvent.type(description(), "merc");
    await userEvent.tab();
    expect(category()).toHaveFocus();
    expect(listbox()).not.toBeVisible();
  });

  it("si el campo pierde el foco sin ir a otro (un toque fuera), se cierra un instante después", async () => {
    renderSuggesting();
    await userEvent.type(description(), "merc");
    act(() => description().blur());
    expect(listbox()).toBeVisible();
    await waitFor(() => expect(listbox()).not.toBeVisible());
  });

  it("y si en ese instante el foco entra a otro campo, se cierra en el acto", async () => {
    renderSuggesting();
    await userEvent.type(description(), "merc");
    act(() => description().blur());
    act(() => category().focus());
    expect(listbox()).not.toBeVisible();
  });

  it("al elegir una que ya usó, propone su última categoría y el lector de pantalla lo dice", async () => {
    renderSuggesting();
    await userEvent.type(description(), "mercado del barrio ");
    expect(category()).toHaveValue("c-mercado");
    expect(screen.getByText("Se eligió la categoría Mercado, la de la última vez.")).toHaveClass("sr-only");

    // Lo envía con esa categoría.
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    await userEvent.type(screen.getByLabelText(/Monto/), "85000");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(action.mock.calls[0][1].get("categoryId")).toBe("c-mercado");
  });

  it("si ya eligió una categoría a mano, no se la cambia", async () => {
    renderSuggesting();
    await userEvent.selectOptions(category(), "c-ropa");
    await userEvent.type(description(), "Mercado del barrio");
    expect(category()).toHaveValue("c-ropa");
  });

  it("no propone nada si la de la última vez no se puede elegir, si no tenía o si no es una que ya usó", async () => {
    renderSuggesting([...CATEGORIES, { id: "c-archivada", name: "Viejita", emoji: "📦", archived: true }]);
    for (const text of ["Vieja", "Regalo", "Mercado"]) {
      await userEvent.clear(description());
      await userEvent.type(description(), text);
      expect(category()).toHaveValue("");
    }
  });

  it("después de registrar, vuelve a proponer aunque antes la hubiera elegido a mano", async () => {
    action.mockResolvedValue({ ok: true, message: "Egreso registrado" });
    renderSuggesting();
    await userEvent.selectOptions(category(), "c-ropa");
    await userEvent.type(screen.getByLabelText(/Monto/), "1000");
    await userEvent.type(description(), "Café");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    await toast("Egreso registrado");

    // (userEvent recuerda lo escrito antes de que React reiniciara el formulario: se limpia primero.)
    await userEvent.clear(description());
    await userEvent.type(description(), "Tenis");
    expect(category()).toHaveValue("c-ropa");
    await userEvent.clear(description());
    await userEvent.type(description(), "Mercado del barrio");
    expect(category()).toHaveValue("c-mercado");
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

  it("muestra el movimiento con sus datos, el monto con separadores y sus dos decimales", () => {
    renderEdit();
    expect(screen.getByRole("heading", { name: "Editar egreso" })).toBeVisible();
    expect(screen.getByLabelText(/Monto/)).toHaveValue("500.000,00");
    expect(screen.getByLabelText(/^Descripción/)).toHaveValue("Zapatos");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c-ropa");
    expect(screen.getByLabelText(/^Fecha/)).toHaveValue("2026-10-10");
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
      amount: "450.000,00",
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
    expect(screen.getByLabelText(/^Descripción/)).toHaveValue("Otra cosa");
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
    expect(screen.getByLabelText(/^Descripción/)).toHaveAccessibleDescription('Escribe una descripción, por ejemplo "Almuerzo".');
    expect(screen.getByLabelText(/^Monto/)).toHaveFocus();
  });

  it("sin fecha, o con una futura, lo dice", async () => {
    renderForm();
    const date = screen.getByLabelText(/^Fecha/);
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
    await userEvent.type(screen.getByLabelText(/^Descripción/), "X");
    await userEvent.click(screen.getByRole("button", { name: "Registrar egreso" }));
    expect(await screen.findByText("Ingresa un monto mayor que cero")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto/)).toHaveAccessibleDescription("Ingresa un monto mayor que cero");
    expect(screen.getByLabelText(/^Monto/)).toHaveAttribute("aria-invalid", "true");
  });
});


describe("TransactionForm · en inglés", () => {
  const renderInEnglish = (ui: React.ReactElement) => renderAlone(<Toaster>{ui}</Toaster>, { wrapper: InEnglish });

  it("los textos, el monto con la coma de miles y el aviso en inglés (con el mes si quedó en otro)", async () => {
    action.mockResolvedValue({ ok: true, message: "Expense added", occurredOn: "2026-09-30" });
    renderInEnglish(<TransactionForm type="expense" categories={CATEGORIES} today="2026-10-14" listMonth={{ start: "2026-10-01", end: "2026-11-01" }} />);
    expect(screen.getByRole("heading", { name: "New expense" })).toBeVisible();
    expect(screen.getByRole("option", { name: "No category" })).toBeInTheDocument();
    const amount = screen.getByLabelText(/Amount/);
    expect(amount).toHaveAttribute("placeholder", "500,000.00");
    await userEvent.type(amount, "1250000.5");
    expect(amount).toHaveValue("1,250,000.5");
    await userEvent.tab();
    expect(amount).toHaveValue("1,250,000.50");
    await userEvent.type(screen.getByLabelText(/Description/), "Shoes");
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await within(screen.getByRole("region", { name: "Notices" })).findByText("Expense added in September 2026", { exact: true })).toBeVisible();
    expect(action.mock.calls[0][1].get("amount")).toBe("1,250,000.50");
  });

  it("los mensajes de los campos, y al editar el monto guardado con su formato", async () => {
    renderInEnglish(
      <TransactionForm type="income" categories={CATEGORIES} today="2026-10-14" transaction={{ id: "t1", amount: 45900.5, description: "Pay", categoryId: null, occurredOn: "2026-10-01" }} cancelHref="/ingresos" />,
    );
    expect(screen.getByRole("heading", { name: "Edit income" })).toBeVisible();
    expect(screen.getByLabelText(/Amount/)).toHaveValue("45,900.50");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/ingresos");
    await userEvent.clear(screen.getByLabelText(/Amount/));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the amount.")).toBeVisible();
  });
});
