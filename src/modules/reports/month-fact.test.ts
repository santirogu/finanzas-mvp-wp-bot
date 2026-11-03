import { describe, expect, it } from "vitest";
import { type CategoryToDate, type MonthFact, monthFact, monthFactText } from "./month-fact";

// El dato del mes del Resumen: la categoría que más se salió de lo normal a esta altura del mes, y su frase.

const m = (month: number, year = 2026) => ({ year, month });
const october = m(10);
const three = [m(7), m(8), m(9)];
/** Lo que llevaba la categoría a esta altura de cada mes (de julio a octubre, en ese orden). */
const category = (name: string, ...totals: (number | null)[]): CategoryToDate[] =>
  totals.flatMap((total, i) => (total === null ? [] : [{ month: `2026-${String(7 + i).padStart(2, "0")}`, name, emoji: "•", total }]));

describe("monthFact", () => {
  it("sin meses con qué comparar, nada", () => {
    expect(monthFact(category("Mercado", null, null, null, 500000), october, [])).toBeNull();
  });

  it("la que más subió en plata (no en porcentaje), con lo que lleva, su promedio y cuánto más", () => {
    const rows = [
      ...category("Domicilios", 100000, 120000, 140000, 180000), // +60.000, 50 %
      ...category("Cine", 10000, 10000, 10000, 40000), // +30.000, 300 %
    ];
    expect(monthFact(rows, october, three)).toEqual({
      direction: "up",
      name: "Domicilios",
      emoji: "•",
      current: 180000,
      average: 120000,
      pct: 50,
      averaged: three,
    });
  });

  it("si empatan en plata, por nombre", () => {
    const rows = [...category("Ropa", 50000, 50000, 50000, 100000), ...category("Mercado", 50000, 50000, 50000, 100000)];
    expect(monthFact(rows, october, three)?.name).toBe("Mercado");
  });

  it.each([
    ["menos de $20.000 de diferencia, aunque sea mucho porcentaje", category("Cine", 5000, 5000, 5000, 20000)],
    ["menos del 20 %, aunque sea mucha plata", category("Arriendo", 1000000, 1000000, 1000000, 1150000)],
  ])("no cuenta: %s", (_, rows) => {
    expect(monthFact(rows, october, three)).toBeNull();
  });

  it("una categoría nueva cuenta con lo que lleva (sin porcentaje)", () => {
    expect(monthFact(category("Viajes", null, null, null, 500000), october, three)).toMatchObject({ direction: "up", current: 500000, average: 0, pct: null });
  });

  it("si ninguna subió lo suficiente, la que más bajó; también si este mes no lleva nada", () => {
    const rows = [...category("Transporte", 100000, 100000, 100000, 70000), ...category("Cine", 30000, 30000, 30000, 25000)];
    expect(monthFact(rows, october, three)).toMatchObject({ direction: "down", name: "Transporte", current: 70000, average: 100000, pct: 30 });
    expect(monthFact(category("Domicilios", 90000, 120000, 150000, null), october, three)).toMatchObject({
      direction: "down",
      current: 0,
      average: 120000,
      pct: 100,
    });
  });

  it("si hay una que subió, gana aunque otra haya bajado más", () => {
    const rows = [...category("Mercado", 100000, 100000, 100000, 130000), ...category("Arriendo", 900000, 900000, 900000, 0)];
    expect(monthFact(rows, october, three)).toMatchObject({ direction: "up", name: "Mercado" });
  });

  it("el promedio es de los meses comparados (los que tuvieron movimientos); los demás meses no cuentan", () => {
    const rows = [...category("Mercado", 900000, null, 100000, 150000), { month: "2026-11", name: "Mercado", emoji: "•", total: 999999 }];
    // Solo septiembre: julio no está entre los comparados.
    expect(monthFact(rows, october, [m(9)])).toMatchObject({ current: 150000, average: 100000, pct: 50, averaged: [m(9)] });
  });

  it("nada se salió de lo normal: nada", () => {
    expect(monthFact(category("Mercado", 100000, 100000, 100000, 105000), october, three)).toBeNull();
  });
});

describe("monthFactText", () => {
  const base = { emoji: "•", averaged: three };
  it.each<[MonthFact, string]>([
    [{ ...base, direction: "up", name: "Domicilios", current: 180000, average: 120000, pct: 50 }, "Domicilios: llevas $180.000,00, 50\u00a0% más que a esta altura en tus últimos 3 meses."],
    [{ ...base, direction: "down", name: "Transporte", current: 70000, average: 100000, pct: 30 }, "Transporte: llevas $70.000,00, 30\u00a0% menos que a esta altura en tus últimos 3 meses."],
    [{ ...base, direction: "up", name: "Viajes", current: 500000, average: 0, pct: null }, "Viajes: llevas $500.000,00, y a esta altura en tus últimos 3 meses no gastabas en esto."],
    [{ ...base, direction: "down", name: "Domicilios", current: 0, average: 120000, pct: 100 }, "Domicilios: no llevas nada, y a esta altura en tus últimos 3 meses solías llevar $120.000,00."],
    [{ ...base, averaged: [m(9)], direction: "up", name: "Mercado", current: 150000, average: 100000, pct: 1500 }, "Mercado: llevas $150.000,00, 1.500\u00a0% más que a esta altura de septiembre."],
  ])("%j", (fact, text) => {
    expect(monthFactText(fact, "COP")).toBe(text);
  });

  it.each<[MonthFact, string]>([
    [{ ...base, direction: "up", name: "Delivery", current: 180000, average: 120000, pct: 50 }, "Delivery: $180,000.00 so far, 50% more than by this point in your last 3 months."],
    [{ ...base, averaged: [m(9)], direction: "down", name: "Transport", current: 70000, average: 100000, pct: 30 }, "Transport: $70,000.00 so far, 30% less than by this point in September."],
    [{ ...base, direction: "up", name: "Trips", current: 500000, average: 0, pct: null }, "Trips: $500,000.00 so far, and by this point in your last 3 months you didn't spend on it."],
    [{ ...base, direction: "down", name: "Delivery", current: 0, average: 120000, pct: 100 }, "Delivery: nothing so far, and by this point in your last 3 months you usually had $120,000.00."],
  ])("en inglés: %j", (fact, text) => {
    expect(monthFactText(fact, "COP", "en")).toBe(text);
  });
});
