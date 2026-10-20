import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type TrendPoint, TrendChart } from "./trend-chart";
import { InEnglish } from "../../../../../test/locale";

const point = (key: string, short: string, name: string, income: number, expense: number, year: string | null = null): TrendPoint => ({
  key,
  short,
  year,
  name,
  href: `/dashboard?mes=${key}`,
  income,
  expense,
  balance: Math.round((income - expense) * 100) / 100,
});

const POINTS = [
  point("2025-12", "dic", "Diciembre de 2025", 4_000_000, 1_000_000, "2025"),
  point("2026-01", "ene", "Enero de 2026", 0, 0, "2026"),
  point("2026-02", "feb", "Febrero de 2026", 1_000, 2_000_000),
];

const bars = (link: HTMLElement) => [...link.querySelectorAll<HTMLElement>("span")].map((bar) => bar.style.height);
// El detalle va oculto para el lector de pantalla (ya lo leyó en el enlace): se busca por eso.
const detail = () => document.querySelector<HTMLElement>("p[aria-hidden]")!;

describe("TrendChart", () => {
  it("cada mes es un enlace a su Resumen, que dice todo lo del mes", () => {
    render(<TrendChart points={POINTS} currency="COP" />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/dashboard?mes=2025-12", "/dashboard?mes=2026-01", "/dashboard?mes=2026-02"]);
    expect(links[0]).toHaveAccessibleName("Diciembre de 2025: ingresos $4.000.000,00, egresos $1.000.000,00, balance $3.000.000,00");
    expect(links[2]).toHaveAccessibleName("Febrero de 2026: ingresos $1.000,00, egresos $2.000.000,00, balance −$1.999.000,00");
  });

  it("el alto de cada barra, frente a la más alta; un monto chico se ve (2 %) y el cero no", () => {
    render(<TrendChart points={POINTS} currency="COP" />);
    const [december, january, february] = screen.getAllByRole("link");
    expect(bars(december)).toEqual(["100%", "25%"]);
    expect(bars(january)).toEqual(["0%", "0%"]);
    expect(bars(february)).toEqual(["2%", "50%"]);
  });

  it("sin ningún monto, todas las barras en cero (sin dividir por cero)", () => {
    render(<TrendChart points={[point("2026-10", "oct", "Octubre de 2026", 0, 0, "2026")]} currency="COP" />);
    expect(bars(screen.getByRole("link"))).toEqual(["0%", "0%"]);
  });

  it("debajo de cada barra, el mes corto y el año en el primero y en cada enero (corto en pantallas angostas)", () => {
    render(<TrendChart points={POINTS} currency="COP" />);
    expect(screen.getByText("’25")).toHaveClass("sm:hidden");
    expect(screen.getByText("2025")).toHaveClass("hidden", "sm:block");
    expect(screen.getByText("dic")).toContainElement(screen.getByText("2025"));
    expect(screen.getByText("ene")).toContainElement(screen.getByText("’26"));
    expect(screen.getByText("feb")).toHaveTextContent(/^feb$/);
  });

  it("al pasar el mouse por un mes, su detalle debajo; al salir, la ayuda otra vez", () => {
    render(<TrendChart points={POINTS} currency="COP" />);
    const [, , february] = screen.getAllByRole("link");
    expect(detail()).toHaveTextContent("Toca un mes para ver su Resumen.");
    fireEvent.mouseEnter(february);
    expect(detail()).toHaveTextContent("Febrero de 2026 · Ingresos $1.000,00 · Egresos $2.000.000,00 · Balance −$1.999.000,00");
    expect(february).toHaveClass("bg-background");
    fireEvent.mouseLeave(february.parentElement!);
    expect(detail()).toHaveTextContent("Toca un mes para ver su Resumen.");
    expect(february).not.toHaveClass("bg-background");
  });

  it("con Tab también (y al salir del gráfico, se quita)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <TrendChart points={POINTS} currency="COP" />
        <button type="button">Después</button>
      </>,
    );
    await user.tab();
    expect(detail()).toHaveTextContent(/^Diciembre de 2025 · Ingresos \$4\.000\.000,00/);
    await user.tab();
    expect(detail()).toHaveTextContent(/^Enero de 2026/);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(detail()).toHaveTextContent("Toca un mes para ver su Resumen.");
  });

  it("con mouse, la ayuda dice que se puede pasar por encima", () => {
    render(<TrendChart points={POINTS} currency="COP" />);
    expect(screen.getByText(/^Pasa el mouse por un mes/)).toHaveClass("hidden", "pointer-fine:inline");
    expect(screen.getByText("Toca un mes para ver su Resumen.")).toHaveClass("pointer-fine:hidden");
  });
});

describe("TrendChart · en inglés", () => {
  it("la leyenda y el detalle de cada mes, en inglés", () => {
    render(<TrendChart points={[point("2026-02", "Feb", "February 2026", 1_000, 2_000_000)]} currency="COP" />, { wrapper: InEnglish });
    expect(screen.getByRole("link", { name: "February 2026: income $1,000.00, expenses $2,000,000.00, balance −$1,999,000.00" })).toBeVisible();
    expect(screen.getByText("Income")).toBeVisible();
    expect(screen.getByText("Expenses")).toBeVisible();
  });
});
