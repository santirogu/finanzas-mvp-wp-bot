import { describe, expect, it } from "vitest";
import { BIGGEST_MAX, biggestExpenses, type ExpenseRow } from "./biggest";

let seq = 0;
const expense = (description: string, amount: number): ExpenseRow => ({
  id: `id-${seq++}`,
  description,
  amount,
  occurredOn: "2026-10-05",
  categoryName: null,
  categoryEmoji: null,
});

describe("biggestExpenses", () => {
  it("los egresos como vienen (del más alto al más bajo), sin los de un gasto fijo", () => {
    const rows = [expense("Arriendo", 1800000), expense("Matrícula", 1200000), expense("Arriendo", 1800000), expense("Mercado", 600000)];
    expect(biggestExpenses(rows, [{ description: "Arriendo" }]).map((r) => r.description)).toEqual(["Matrícula", "Mercado"]);
  });

  it("el fijo se reconoce sin importar mayúsculas, tildes ni espacios", () => {
    const rows = [expense("ADMINISTRACIÓN  cívica ", 300000), expense("Administracion Civica", 300000), expense("Cine", 30000)];
    expect(biggestExpenses(rows, [{ description: "Administración Cívica" }]).map((r) => r.description)).toEqual(["Cine"]);
  });

  it(`hasta ${BIGGEST_MAX}`, () => {
    const rows = Array.from({ length: 40 }, (_, i) => expense(`Gasto ${i}`, 1000 - i));
    const biggest = biggestExpenses(rows, []);
    expect(biggest).toHaveLength(BIGGEST_MAX);
    expect(biggest.at(-1)?.description).toBe(`Gasto ${BIGGEST_MAX - 1}`);
  });

  it("sin gastos fijos, todos; sin egresos, ninguno", () => {
    expect(biggestExpenses([expense("Cine", 30000)], [])).toHaveLength(1);
    expect(biggestExpenses([], [{ description: "Arriendo" }])).toEqual([]);
  });
});
