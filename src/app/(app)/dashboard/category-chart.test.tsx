import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { chartSlices } from "@/modules/transactions/category-chart";
import { CategoryChart } from "./category-chart";

const cat = (name: string, emoji: string, total: number) => ({ name, emoji, total });

// Ropa 60%, Mercado 30%, Taxi 8%, y dos chicas (1% cada una) que van juntas en "2 más".
const CATEGORIES = [
  cat("Ropa", "👕", 600_000),
  cat("Mercado", "🛒", 300_000),
  cat("Taxi", "🚕", 80_000),
  cat("Cine", "🎬", 10_000),
  cat("Impuestos", "🧾", 10_000),
];
const TOTAL = 1_000_000;

function renderChart(categories = CATEGORIES, total = TOTAL) {
  render(<CategoryChart slices={chartSlices(categories, total)} total={total} currency="COP" />);
  return { slices: () => [...document.querySelectorAll("circle[data-slice]")] };
}

const row = (name: RegExp) => screen.getByRole("button", { name });

describe("CategoryChart", () => {
  it("una fila por tajada, de la más grande a la más chica, con su monto y su porcentaje", () => {
    renderChart();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "👕 Ropa$600.000,00 · 60%",
      "🛒 Mercado$300.000,00 · 30%",
      "🚕 Taxi$80.000,00 · 8%",
      "2 más$20.000,00 · 2%",
    ]);
  });

  it("las chicas, una por una, debajo de su fila gris", () => {
    renderChart();
    const rest = row(/2 más/).closest("li")!;
    const items = within(rest).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["🎬 Cine$10.000,00 · 1%", "🧾 Impuestos$10.000,00 · 1%"]);
    expect(row(/2 más/)).toHaveClass("text-muted");
    expect(row(/Ropa/)).not.toHaveClass("text-muted");
  });

  it("una tajada por fila, con el color de su puesto (y el gris para las juntas)", () => {
    const { slices } = renderChart();
    expect(slices().map((c) => c.getAttribute("class")?.match(/stroke-chart-\S+/)?.[0])).toEqual([
      "stroke-chart-1",
      "stroke-chart-2",
      "stroke-chart-3",
      "stroke-chart-rest",
    ]);
    // El mismo color en el punto de la lista.
    expect(row(/Taxi/).querySelector("[class*='bg-chart']")).toHaveClass("bg-chart-3");
    expect(row(/2 más/).querySelector("[class*='bg-chart']")).toHaveClass("bg-chart-rest");
  });

  it("cada tajada empieza donde termina la anterior, con un espacio entre ellas", () => {
    const { slices } = renderChart();
    const circumference = 2 * Math.PI * 60;
    // Todas miden la vuelta igual, aunque la resaltada tenga otro radio.
    for (const c of slices()) expect(Number(c.getAttribute("pathLength"))).toBeCloseTo(circumference);
    const [ropa, mercado] = slices();
    expect(Number(ropa.getAttribute("stroke-dashoffset"))).toBeCloseTo(0);
    expect(Number(mercado.getAttribute("stroke-dashoffset"))).toBeCloseTo(-0.6 * circumference);
    const dash = Number(ropa.getAttribute("stroke-dasharray")?.split(" ")[0]);
    expect(dash).toBeCloseTo(0.6 * circumference - 1.5);
  });

  it("una sola categoría es la vuelta entera (sin espacio)", () => {
    const { slices } = renderChart([cat("Ropa", "👕", 500_000)], 500_000);
    const dash = Number(slices()[0].getAttribute("stroke-dasharray")?.split(" ")[0]);
    expect(dash).toBeCloseTo(2 * Math.PI * 60);
    expect(row(/Ropa/)).toHaveTextContent("$500.000,00 · 100%");
  });

  it("una sola chica que no alcanzó color se llama por su nombre (no \"1 más\")", () => {
    const eight = Array.from({ length: 8 }, (_, i) => cat(`C${i}`, "•", 100 - i));
    renderChart(eight, eight.reduce((sum, c) => sum + c.total, 0));
    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)).toHaveTextContent("• C7");
    expect(screen.queryByText(/más/)).toBeNull();
  });

  it("tocar una fila resalta su tajada y apaga las demás; tocarla otra vez lo quita", async () => {
    const user = userEvent.setup();
    const { slices } = renderChart();
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");

    await user.click(row(/Mercado/));
    expect(row(/Mercado/)).toHaveAttribute("aria-pressed", "true");
    expect(row(/Ropa/)).toHaveAttribute("aria-pressed", "false");
    const [ropa, mercado] = slices();
    expect(mercado).toHaveAttribute("stroke-width", "26");
    expect(mercado).not.toHaveClass("opacity-30");
    expect(ropa).toHaveAttribute("stroke-width", "22");
    expect(ropa).toHaveClass("opacity-30");
    // Engorda solo hacia afuera: el borde de adentro (radio menos medio trazo) queda donde estaba.
    const inner = (c: Element) => Number(c.getAttribute("r")) - Number(c.getAttribute("stroke-width")) / 2;
    expect(inner(mercado)).toBe(inner(ropa));
    expect(mercado).toHaveAttribute("r", "62");

    await user.click(row(/Mercado/));
    expect(row(/Mercado/)).toHaveAttribute("aria-pressed", "false");
    for (const c of slices()) expect(c).not.toHaveClass("opacity-30");
  });

  it("tocar una tajada también la resalta, y tocar otra cambia el resaltado", async () => {
    const user = userEvent.setup();
    const { slices } = renderChart();
    await user.click(slices()[2]);
    expect(row(/Taxi/)).toHaveAttribute("aria-pressed", "true");
    await user.click(slices()[0]);
    expect(row(/Ropa/)).toHaveAttribute("aria-pressed", "true");
    expect(row(/Taxi/)).toHaveAttribute("aria-pressed", "false");
  });

  it("la dona es decorativa: el lector de pantalla lee la lista", () => {
    renderChart();
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("al centro, el total de egresos, con la letra de text-sm hasta 13 caracteres", () => {
    renderChart();
    const total = screen.getByText("$1.000.000,00");
    expect(total).toHaveClass("whitespace-nowrap");
    expect(total.style.fontSize).toBe("0.875rem");
    expect(total.previousElementSibling).toHaveTextContent("Egresos");
  });

  it.each([
    ["$12.345.678.901,00", 12_345_678_901, 11.4 / 18],
    ["$100.012.309.982,99", 100_012_309_982.99, 0.6],
  ])("un monto más largo (%s) va con la letra más chica, para que quepa en el hueco", (label, amount, rem) => {
    renderChart([cat("Casa", "🏠", amount)], amount);
    const total = screen.getByText(label, { selector: "span.font-semibold" });
    expect(parseFloat(total.style.fontSize)).toBeCloseTo(rem, 5);
  });
});
