import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/transactions/actions", () => ({ restoreTransactionAction: vi.fn() }));

const { TransactionNotice } = await import("./transaction-notice");

const ID = "00000000-0000-4000-8000-000000000001";

describe("TransactionNotice", () => {
  it("después de borrar: avisa, ofrece deshacer y recibe el foco", () => {
    render(<TransactionNotice kind="deleted" id={ID} description="Almuerzo" closeHref="/egresos" />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Se borró «Almuerzo».");
    expect(notice).toHaveFocus();
    const undo = screen.getByRole("button", { name: "Deshacer" });
    expect(undo.closest("form")?.querySelector("input[name=id]")).toHaveValue(ID);
    expect(screen.getByRole("link", { name: "Cerrar el aviso" })).toHaveAttribute("href", "/egresos");
  });

  it("después de deshacer: avisa sin botón, y también recibe el foco", () => {
    render(<TransactionNotice kind="restored" id={ID} description="Almuerzo" closeHref="/ingresos" />);

    expect(screen.getByRole("status")).toHaveTextContent("Se restauró «Almuerzo».");
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Deshacer" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cerrar el aviso" })).toHaveAttribute("href", "/ingresos");
  });
});
