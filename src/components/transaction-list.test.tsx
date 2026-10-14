import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRow } from "@/modules/transactions/queries";

vi.mock("@/modules/transactions/actions", () => ({ deleteTransactionAction: vi.fn() }));

const { TransactionList } = await import("./transaction-list");

const row = (overrides: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  type: "expense",
  amount: 500000,
  currency: "COP",
  description: "Zapatos",
  occurredOn: "2026-10-13",
  source: "web",
  categoryName: "Ropa",
  categoryEmoji: "👟",
  ...overrides,
});

describe("TransactionList", () => {
  it("sin movimientos muestra el mensaje vacío", () => {
    render(<TransactionList items={[]} emptyMessage="No has registrado egresos este mes." />);
    expect(screen.getByText("No has registrado egresos este mes.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("muestra cada movimiento con su categoría, fecha y monto con signo", () => {
    render(
      <TransactionList
        emptyMessage="vacío"
        items={[
          row(),
          row({
            id: "00000000-0000-4000-8000-000000000002",
            type: "income",
            amount: 2000000,
            description: "Pago de nómina",
            categoryName: "Salario",
            categoryEmoji: "💼",
          }),
        ]}
      />,
    );

    const [expense, income] = screen.getAllByRole("listitem");
    expect(expense).toHaveTextContent("👟");
    expect(expense).toHaveTextContent("Zapatos");
    expect(expense).toHaveTextContent("13 de oct · Ropa");
    expect(within(expense).getByText(/−\$\s500\.000/)).toHaveClass("text-expense");
    expect(within(income).getByText(/\+\$\s2\.000\.000/)).toHaveClass("text-income");
  });

  it("marca los movimientos que llegaron por WhatsApp", () => {
    render(<TransactionList emptyMessage="vacío" items={[row({ source: "whatsapp" })]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Ropa · vía WhatsApp");
  });

  it("sin categoría usa un punto y 'Sin categoría'", () => {
    render(
      <TransactionList emptyMessage="vacío" items={[row({ categoryName: null, categoryEmoji: null })]} />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("•");
    expect(item).toHaveTextContent("Sin categoría");
  });

  it("solo con allowDelete muestra el botón de eliminar, con nombre accesible y el id del movimiento", () => {
    const { rerender } = render(<TransactionList emptyMessage="vacío" items={[row()]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<TransactionList emptyMessage="vacío" items={[row()]} allowDelete />);
    const button = screen.getByRole("button", { name: "Eliminar Zapatos" });
    const form = button.closest("form")!;
    expect(form.querySelector('input[name="id"]')).toHaveValue("00000000-0000-4000-8000-000000000001");
  });
});
