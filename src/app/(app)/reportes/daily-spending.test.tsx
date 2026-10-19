import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ExpenseRow } from "@/modules/reports/biggest";
import { calendarDays, type DayTotal, heatLevels } from "@/modules/reports/daily";
import { DailySpending, type DailySpendingProps } from "./daily-spending";

const october = { year: 2026, month: 10 };
const expense = (id: string, occurredOn: string, description: string, amount: number, category: [string, string] | null = null): ExpenseRow => ({
  id,
  description,
  amount,
  occurredOn,
  categoryEmoji: category?.[0] ?? null,
  categoryName: category?.[1] ?? null,
});
const EXPENSES = [
  expense("cine", "2026-10-10", "Cine y comida", 185000, ["🎬", "Entretenimiento"]),
  expense("taxi", "2026-10-10", "Taxi", 60000),
  expense("cafe", "2026-10-12", "Café", 12000, ["🍽️", "Alimentación"]),
];
const DAYS = new Map<string, DayTotal>([
  ["2026-10-10", { total: 245000, count: 2 }],
  ["2026-10-12", { total: 12000, count: 1 }],
]);

const props = (overrides: Partial<DailySpendingProps> = {}): DailySpendingProps => ({
  monthLabel: "Octubre de 2026",
  prev: { href: "/reportes?calendario=2026-09", name: "septiembre de 2026" },
  next: null,
  offset: 3,
  days: calendarDays(october, DAYS, heatLevels([245000, 12000]), EXPENSES, "2026-10-19").map((day) => ({
    ...day,
    name: `día ${day.day} de octubre`,
  })),
  weekdays: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((label, i) => ({
    label,
    average: i === 5 ? 158600 : 21400,
  })),
  insight: "Gastas más los sábados: 641% más que el promedio de los otros días.",
  halves: { first: 580000, second: 420000 },
  currency: "COP",
  empty: null,
  ...overrides,
});

const section = () => within(screen.getByRole("region", { name: "¿Qué días gastas más?" }));
const day = (n: number) => section().getByRole("button", { name: new RegExp(`^día ${n} de octubre:`) });
const detail = () => section().getByRole("heading", { level: 4 }).parentElement!.parentElement!;

describe("DailySpending", () => {
  it("el mes con sus flechas: la de antes lleva al mes anterior del período; la de después, apagada", () => {
    render(<DailySpending {...props()} />);
    expect(section().getByRole("heading", { level: 3, name: "Octubre de 2026" })).toBeInTheDocument();
    expect(section().getByRole("link", { name: "Mes anterior: septiembre de 2026" })).toHaveAttribute("href", "/reportes?calendario=2026-09");
    expect(section().getByRole("link", { name: "Mes siguiente" })).toHaveAttribute("aria-disabled", "true");
  });

  it("cada día que ya pasó es un botón que dice su total; los que no han llegado, no; antes del 1, los huecos de la semana", () => {
    render(<DailySpending {...props()} />);
    const days = section().getAllByRole("button", { name: /^día \d+ de octubre:/ });
    expect(days).toHaveLength(19);
    expect(day(10)).toHaveAccessibleName("día 10 de octubre: $245.000,00 en 2 egresos");
    expect(day(12)).toHaveAccessibleName("día 12 de octubre: $12.000,00 en 1 egreso");
    expect(day(11)).toHaveAccessibleName("día 11 de octubre: sin egresos");
    // El 1 de octubre de 2026 es jueves: tres huecos antes.
    const cells = section().getAllByRole("listitem", { hidden: true }).slice(0, 4);
    expect(cells.slice(0, 3).every((cell) => cell.getAttribute("aria-hidden") === "true" && cell.textContent === "")).toBe(true);
    expect(within(cells[3]).getByRole("button")).toHaveTextContent("1");
  });

  it("el tono de cada día: el de más gasto, el más oscuro (con el número en el color de la tarjeta)", () => {
    render(<DailySpending {...props()} />);
    expect(day(10)).toHaveClass("bg-expense", "text-surface");
    expect(day(12)).toHaveClass("bg-expense/25", "text-foreground");
    expect(day(11)).toHaveClass("bg-background");
  });

  it("empieza en el día de más gasto, con su total y sus egresos, que llevan a editarlos", () => {
    render(<DailySpending {...props()} />);
    expect(day(10)).toHaveAttribute("aria-pressed", "true");
    expect(detail()).toHaveTextContent(/^Sábado 10 de oct−\$245\.000,002 egresos/);
    const links = within(detail()).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/movimientos/cine/editar", "/movimientos/taxi/editar"]);
    expect(links[0]).toHaveTextContent("🎬 Cine y comidaEntretenimiento−$185.000,00");
    expect(links[1]).toHaveTextContent("Sin categoría");
  });

  it("al tocar otro día, muestra el suyo; uno sin gastos lo dice", async () => {
    const user = userEvent.setup();
    render(<DailySpending {...props()} />);
    await user.click(day(12));
    expect(day(12)).toHaveAttribute("aria-pressed", "true");
    expect(day(10)).toHaveAttribute("aria-pressed", "false");
    expect(detail()).toHaveTextContent(/^Lunes 12 de oct−\$12\.000,001 egreso/);
    await user.click(day(11));
    expect(detail()).toHaveTextContent("Domingo 11 de octNo gastaste nada ese día (sin contar los gastos fijos).");
    expect(within(detail()).queryAllByRole("link")).toEqual([]);
  });

  it("un día con más de 10 egresos muestra 10 y los demás con «Ver los N siguientes», cerrado de nuevo en cada día", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => expense(`e${i}`, "2026-10-10", `Gasto ${i}`, 1000 - i));
    const days = calendarDays(october, new Map([["2026-10-10", { total: 11934, count: 12 }], ["2026-10-12", { total: 12000, count: 1 }]]), heatLevels([11934, 12000]), [...many, EXPENSES[2]], "2026-10-19").map(
      (d) => ({ ...d, name: `día ${d.day} de octubre` }),
    );
    render(<DailySpending {...props({ days })} />);
    await user.click(day(10));
    const more = within(detail()).getByText("Ver los 2 siguientes");
    const links = within(detail()).getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(links[9]).toBeVisible();
    expect(links[10]).not.toBeVisible();
    await user.click(more);
    expect(links[11]).toBeVisible();
    await user.click(day(12));
    await user.click(day(10));
    expect(within(detail()).getByText("Ver los 2 siguientes").closest("details")).not.toHaveAttribute("open");
  });

  it("con 11, «Ver el siguiente»", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 11 }, (_, i) => expense(`e${i}`, "2026-10-10", `Gasto ${i}`, 1000 - i));
    const days = calendarDays(october, new Map([["2026-10-10", { total: 10945, count: 11 }]]), heatLevels([10945]), many, "2026-10-19").map((d) => ({
      ...d,
      name: `día ${d.day} de octubre`,
    }));
    render(<DailySpending {...props({ days })} />);
    await user.click(day(10));
    expect(within(detail()).getByText("Ver el siguiente")).toBeInTheDocument();
  });

  it("un mes sin gastos no elige ningún día", () => {
    const days = calendarDays(october, new Map(), heatLevels([]), [], "2026-10-19").map((d) => ({ ...d, name: `día ${d.day} de octubre` }));
    render(<DailySpending {...props({ days })} />);
    expect(section().getByText("Toca un día para ver qué gastaste.")).toBeInTheDocument();
    expect(section().queryAllByRole("button", { pressed: true })).toEqual([]);
  });

  it("el promedio por día de la semana (el más alto, resaltado), la frase y las quincenas", () => {
    render(<DailySpending {...props()} />);
    const rows = section().getByRole("heading", { name: "Por día de la semana" }).parentElement!.querySelectorAll("li");
    expect([...rows].map((row) => row.textContent)).toEqual([
      "Lunes$21.400,00",
      "Martes$21.400,00",
      "Miércoles$21.400,00",
      "Jueves$21.400,00",
      "Viernes$21.400,00",
      "Sábado$158.600,00",
      "Domingo$21.400,00",
    ]);
    expect(within(rows[5]).getByText("Sábado")).toHaveClass("font-medium");
    expect(within(rows[0]).getByText("Lunes")).toHaveClass("text-muted");
    expect(section().getByText("Gastas más los sábados: 641% más que el promedio de los otros días.")).toBeInTheDocument();
    expect(section().getByText("Del 1 al 15: 58%")).toBeInTheDocument();
    expect(section().getByText("Del 16 al fin de mes: 42%")).toBeInTheDocument();
  });

  it("sin egresos para mostrar, lo dice en vez del calendario", () => {
    render(<DailySpending {...props({ empty: "Todos los egresos del período son gastos fijos." })} />);
    expect(section().getByText("Todos los egresos del período son gastos fijos.")).toBeInTheDocument();
    expect(section().queryAllByRole("button")).toEqual([]);
    expect(section().queryByText("Por día de la semana")).toBeNull();
  });
});
