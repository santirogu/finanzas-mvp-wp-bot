import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRow } from "@/modules/transactions/queries";
import { InEnglish } from "../../test/locale";

vi.mock("@/modules/transactions/actions", () => ({ deleteTransactionAction: vi.fn() }));

const { SearchableTransactionList } = await import("./searchable-transaction-list");

let next = 0;
const row = (description: string, categoryName: string | null, amount: number, type: "income" | "expense" = "expense"): TransactionRow => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  type,
  amount,
  currency: "COP",
  description,
  occurredOn: "2026-09-30",
  source: "web",
  categoryName,
  categoryEmoji: "•",
});

const SEPTEMBER = [
  row("Arriendo Civita", "Vivienda", 4_900_000),
  row("Claro Postpago Papo", "Servicios", 82_150),
  row("Claro Hogar Civita", "Servicios", 74_900),
  row("Claro Hogar Áki", "Servicios", 125_749),
  row("Crédito Hipotecario Áki Bancolombia", "Deudas", 2_015_015),
  row("Suscripciones", "Entretenimiento", 671_000),
];

function renderList(items = SEPTEMBER, type: "income" | "expense" = "expense") {
  render(
    <SearchableTransactionList
      items={items}
      type={type}
      inMonth="en septiembre"
      currency="COP"
      emptyMessage="No registraste egresos en septiembre."
    />,
  );
}

const search = () => screen.getByRole("searchbox", { name: "Buscar egresos" });
const descriptions = () =>
  within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
const heading = () => screen.getByRole("heading", { level: 2 });

describe("SearchableTransactionList", () => {
  it("con menos de 6 movimientos no hay buscador; el título dice cuántos hay", () => {
    renderList(SEPTEMBER.slice(0, 5));
    expect(screen.queryByRole("search")).toBeNull();
    expect(heading()).toHaveTextContent("5 movimientos en septiembre");
  });

  it("con uno solo, en singular", () => {
    renderList(SEPTEMBER.slice(0, 1));
    expect(heading()).toHaveTextContent("1 movimiento en septiembre");
  });

  it("sin movimientos, el mensaje de siempre", () => {
    renderList([]);
    expect(screen.getByText("No registraste egresos en septiembre.")).toBeVisible();
    expect(heading()).toHaveTextContent("0 movimientos en septiembre");
  });

  it("desde 6, el buscador; sin nada escrito están todos y no se muestra suma", () => {
    renderList();
    expect(screen.getByRole("search")).toContainElement(search());
    expect(search()).toHaveAttribute("placeholder", "Buscar por descripción o categoría");
    expect(search()).toHaveClass("input");
    expect(heading()).toHaveTextContent("6 movimientos en septiembre");
    expect(descriptions()).toHaveLength(6);
    expect(screen.queryByText(/^−\$/, { selector: "p" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Borrar la búsqueda" })).toBeNull();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("al escribir filtra por descripción, con cuántos de cuántos, su suma y lo que coincide marcado", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "claro");
    expect(descriptions()).toEqual(["Claro Postpago Papo", "Claro Hogar Civita", "Claro Hogar Áki"]);
    expect(heading()).toHaveTextContent("3 de 6 movimientos en septiembre");
    // 82.150 + 74.900 + 125.749
    expect(screen.getByText("−$282.799,00")).toHaveClass("text-expense", "whitespace-nowrap");
    expect(screen.getByRole("status")).toHaveTextContent("3 de 6 movimientos");
    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["Claro", "Claro", "Claro"]);
  });

  it("también por la categoría (marcada en su renglón)", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "deu");
    expect(descriptions()).toEqual(["Crédito Hipotecario Áki Bancolombia"]);
    expect(document.querySelector("mark")).toHaveTextContent("Deu");
    expect(document.querySelector("mark")?.closest("p")).toHaveTextContent("Deudas");
  });

  it("la ✕ borra la búsqueda y deja el foco en el buscador", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "civ");
    expect(descriptions()).toEqual(["Arriendo Civita", "Claro Hogar Civita"]);
    await user.click(screen.getByRole("button", { name: "Borrar la búsqueda" }));
    expect(search()).toHaveValue("");
    expect(search()).toHaveFocus();
    expect(descriptions()).toHaveLength(6);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("Escape también la borra", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "civ{Escape}");
    expect(search()).toHaveValue("");
    expect(descriptions()).toHaveLength(6);
  });

  it("Escape sin nada escrito no hace nada (deja que lo use la página)", async () => {
    const user = userEvent.setup();
    renderList();
    const onKey = vi.fn((e: KeyboardEvent) => e.defaultPrevented);
    document.addEventListener("keydown", onKey);
    await user.type(search(), "{Escape}");
    document.removeEventListener("keydown", onKey);
    expect(onKey).toHaveReturnedWith(false);
  });

  it("Enter cierra el teclado (quita el foco) y deja la búsqueda", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "claro{Enter}");
    expect(search()).not.toHaveFocus();
    expect(search()).toHaveValue("claro");
  });

  it("si nada coincide, lo dice y ofrece borrar la búsqueda", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(search(), "  zzz ");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("Ningún egreso coincide con “zzz” en septiembre.")).toBeVisible();
    expect(heading()).toHaveTextContent("0 de 6 movimientos en septiembre");
    expect(screen.getByRole("status")).toHaveTextContent("Ninguno coincide");
    expect(screen.queryByText(/^−\$/, { selector: "p" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Borrar la búsqueda" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(search()).toHaveValue("");
    expect(search()).toHaveFocus();
    expect(descriptions()).toHaveLength(6);
  });

  it("al borrar uno mientras se busca, la búsqueda sigue aunque queden menos de 6", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SearchableTransactionList items={SEPTEMBER} type="expense" inMonth="en septiembre" currency="COP" emptyMessage="vacío" />,
    );
    await user.type(search(), "civ");
    rerender(
      <SearchableTransactionList items={SEPTEMBER.slice(1)} type="expense" inMonth="en septiembre" currency="COP" emptyMessage="vacío" />,
    );
    expect(search()).toHaveValue("civ");
    expect(heading()).toHaveTextContent("1 de 5 movimientos en septiembre");
    // Y al borrarla tampoco desaparece (el foco queda en el buscador).
    await user.click(screen.getByRole("button", { name: "Borrar la búsqueda" }));
    expect(search()).toHaveFocus();
    expect(descriptions()).toHaveLength(5);
  });

  it("en Ingresos: dice ingresos y la suma va en verde con +", async () => {
    const user = userEvent.setup();
    const incomes = Array.from({ length: 6 }, (_, i) => row(`Pago ${i}`, "Salario", 1_000_000, "income"));
    renderList(incomes, "income");
    const box = screen.getByRole("searchbox", { name: "Buscar ingresos" });
    await user.type(box, "pago");
    expect(screen.getByText("+$6.000.000,00")).toHaveClass("text-income");
    await user.clear(box);
    await user.type(box, "nada");
    expect(screen.getByText("Ningún ingreso coincide con “nada” en septiembre.")).toBeVisible();
  });
});

describe("SearchableTransactionList · en inglés", () => {
  it("el título, el buscador, el total y lo que no coincide, en inglés", async () => {
    render(
      <SearchableTransactionList items={[...SEPTEMBER, row("Almuerzo", null, 25_000)]} type="expense" inMonth="in September" currency="COP" emptyMessage="—" />,
      { wrapper: InEnglish },
    );
    expect(screen.getByRole("heading", { name: "7 transactions in September" })).toBeVisible();
    const search = screen.getByRole("searchbox", { name: "Search expenses" });
    expect(search).toHaveAttribute("placeholder", "Search by description or category");
    await userEvent.type(search, "claro");
    expect(screen.getByRole("heading", { name: "3 of 7 transactions in September" })).toBeVisible();
    expect(screen.getByText("−$282,799.00")).toBeVisible();
    // Sin categoría se busca por lo que dice en inglés.
    await userEvent.clear(search);
    await userEvent.type(search, "no cat");
    expect(screen.getByRole("heading", { name: "1 of 7 transactions in September" })).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText(/No expense matches “zzz” in September\./)).toBeVisible();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear the search" })[0]);
    expect(search).toHaveValue("");
  });
});
