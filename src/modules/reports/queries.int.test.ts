import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import { listCategories } from "@/modules/transactions/queries";
import { createUser } from "../../../test/integration/factories";
import { reportPeriod } from "./period";
import {
  getCategoryMonthlyTotals,
  getExpenseDescriptionsByMonth,
  getLargestExpenses,
  getMonthlyTotals,
  getReport,
  listPeriodMovements,
} from "./queries";

const m = (month: number, year = 2026) => ({ year, month });
const october = m(10);

type NewTx = Partial<typeof transaction.$inferInsert> & { userId: string };
const addTx = (tx: NewTx) =>
  db
    .insert(transaction)
    .values({ type: "expense", amount: 10000, description: "Movimiento", occurredOn: "2026-10-15", ...tx })
    .returning()
    .then((rows) => rows[0]);

const globalCategory = async (name: string) => (await listCategories("nadie", "expense")).find((c) => c.name === name)!;
const byMonth = <T extends { month: string }>(rows: T[]) => [...rows].sort((a, b) => a.month.localeCompare(b.month));

describe("getMonthlyTotals", () => {
  it("los ingresos y egresos de cada mes, del primer día del primero al último del último", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, occurredOn: "2026-07-31", amount: 1 });
    await addTx({ userId: user.id, occurredOn: "2026-08-01", amount: 100.25 });
    await addTx({ userId: user.id, occurredOn: "2026-08-20", type: "income", amount: 500 });
    await addTx({ userId: user.id, occurredOn: "2026-09-30", amount: 0.1 });
    await addTx({ userId: user.id, occurredOn: "2026-09-30", amount: 0.2 });
    await addTx({ userId: user.id, occurredOn: "2026-10-01", amount: 1 });

    expect(byMonth(await getMonthlyTotals(user.id, m(8), m(9)))).toEqual([
      { month: "2026-08", income: 500, expense: 100.25 },
      { month: "2026-09", income: 0, expense: 0.3 },
    ]);
  });

  it("sin los eliminados ni los de otras cuentas", async () => {
    const user = await createUser();
    const other = await createUser();
    await addTx({ userId: user.id, amount: 100 });
    await addTx({ userId: user.id, amount: 999, deletedAt: new Date() });
    await addTx({ userId: other.id, amount: 5000 });
    expect(await getMonthlyTotals(user.id, october, october)).toEqual([{ month: "2026-10", income: 0, expense: 100 }]);
  });
});

describe("getCategoryMonthlyTotals", () => {
  it("los egresos de cada categoría por mes (sin categoría también), sin los ingresos", async () => {
    const user = await createUser();
    const mercado = await globalCategory("Mercado");
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 300, occurredOn: "2026-09-10" });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 200, occurredOn: "2026-09-20" });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 50, occurredOn: "2026-10-01" });
    await addTx({ userId: user.id, amount: 70, occurredOn: "2026-10-02" });
    await addTx({ userId: user.id, type: "income", amount: 9999, occurredOn: "2026-10-02" });

    const rows = await getCategoryMonthlyTotals(user.id, m(9), october);
    expect(byMonth(rows).map((r) => [r.month, r.name, r.total])).toEqual(
      expect.arrayContaining([
        ["2026-09", "Mercado", 500],
        ["2026-10", "Mercado", 50],
        ["2026-10", "Sin categoría", 70],
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.name === "Sin categoría")?.emoji).toBe("•");
  });
});

describe("getExpenseDescriptionsByMonth", () => {
  it("junta la misma descripción en un mes (sin importar mayúsculas ni espacios), con la del último movimiento", async () => {
    const user = await createUser();
    const vivienda = await globalCategory("Vivienda");
    await addTx({ userId: user.id, description: "arriendo ", amount: 900, occurredOn: "2026-10-01" });
    await addTx({ userId: user.id, description: "  Arriendo", amount: 900, occurredOn: "2026-10-16", categoryId: vivienda.id });
    await addTx({ userId: user.id, description: "Netflix", amount: 44900, occurredOn: "2026-10-03" });
    await addTx({ userId: user.id, description: "Arriendo", type: "income", amount: 5, occurredOn: "2026-10-03" });

    const rows = await getExpenseDescriptionsByMonth(user.id, october, october);
    expect(rows.sort((a, b) => a.description.localeCompare(b.description))).toEqual([
      { month: "2026-10", description: "Arriendo", emoji: vivienda.emoji, count: 2, total: 1800, latest: "2026-10-16" },
      { month: "2026-10", description: "Netflix", emoji: "•", count: 1, total: 44900, latest: "2026-10-03" },
    ]);
  });
});

describe("getLargestExpenses", () => {
  it("los egresos del período, del más alto al más bajo (si empatan, el más reciente), con su categoría", async () => {
    const user = await createUser();
    const other = await createUser();
    const mercado = await globalCategory("Mercado");
    await addTx({ userId: user.id, description: "Mercado", categoryId: mercado.id, amount: 300, occurredOn: "2026-09-10" });
    await addTx({ userId: user.id, description: "Cine", amount: 900, occurredOn: "2026-10-01" });
    await addTx({ userId: user.id, description: "Taxi", amount: 300, occurredOn: "2026-10-12" });
    // Fuera del período, ingresos, eliminados y de otra cuenta: no.
    await addTx({ userId: user.id, description: "Viejo", amount: 5000, occurredOn: "2026-08-31" });
    await addTx({ userId: user.id, description: "Salario", type: "income", amount: 9000, occurredOn: "2026-10-02" });
    await addTx({ userId: user.id, description: "Borrado", amount: 8000, occurredOn: "2026-10-03", deletedAt: new Date() });
    await addTx({ userId: other.id, description: "Ajeno", amount: 7000, occurredOn: "2026-10-04" });

    const rows = await getLargestExpenses(user.id, m(9), october);
    expect(rows.map((r) => [r.description, r.amount, r.occurredOn])).toEqual([
      ["Cine", 900, "2026-10-01"],
      ["Taxi", 300, "2026-10-12"],
      ["Mercado", 300, "2026-09-10"],
    ]);
    expect(rows[2]).toMatchObject({ categoryName: "Mercado", categoryEmoji: mercado.emoji });
    expect(rows[0]).toMatchObject({ categoryName: null, categoryEmoji: null });
  });
});

describe("listPeriodMovements", () => {
  it("los movimientos del período (ingresos y egresos), del más antiguo al más reciente, con su categoría y origen", async () => {
    const user = await createUser();
    const other = await createUser();
    const mercado = await globalCategory("Mercado");
    await addTx({ userId: user.id, description: "Segundo del día", occurredOn: "2026-10-05", amount: 2 });
    await addTx({ userId: user.id, description: "Mercado", categoryId: mercado.id, occurredOn: "2026-09-01", amount: 45900.5 });
    await addTx({ userId: user.id, description: "Salario", type: "income", occurredOn: "2026-10-31", amount: 4000000, source: "whatsapp" });
    // Fuera del período, eliminados y de otra cuenta: no.
    await addTx({ userId: user.id, description: "Viejo", occurredOn: "2026-08-31" });
    await addTx({ userId: user.id, description: "Borrado", deletedAt: new Date() });
    await addTx({ userId: other.id, description: "Ajeno" });

    const rows = await listPeriodMovements(user.id, m(9), october);
    expect(rows).toEqual([
      { occurredOn: "2026-09-01", type: "expense", description: "Mercado", categoryName: "Mercado", amount: 45900.5, source: "web" },
      { occurredOn: "2026-10-05", type: "expense", description: "Segundo del día", categoryName: null, amount: 2, source: "web" },
      { occurredOn: "2026-10-31", type: "income", description: "Salario", categoryName: null, amount: 4000000, source: "whatsapp" },
    ]);
  });

  it("el mismo día, en el orden en que se registraron", async () => {
    const user = await createUser();
    await addTx({ userId: user.id, description: "Primero", createdAt: new Date("2026-10-05T10:00:00Z") });
    await addTx({ userId: user.id, description: "Segundo", createdAt: new Date("2026-10-05T11:00:00Z") });
    expect((await listPeriodMovements(user.id, october, october)).map((r) => r.description)).toEqual(["Primero", "Segundo"]);
  });
});

describe("getReport", () => {
  it("arma todo el período: los meses, las cifras, las categorías y los gastos fijos", async () => {
    const user = await createUser();
    const vivienda = await globalCategory("Vivienda");
    const mercado = await globalCategory("Mercado");
    for (const month of ["07", "08", "09", "10"]) {
      await addTx({ userId: user.id, description: "Arriendo", categoryId: vivienda.id, amount: 1800000, occurredOn: `2026-${month}-05` });
      await addTx({ userId: user.id, type: "income", description: "Salario", amount: 4000000, occurredOn: `2026-${month}-15` });
    }
    await addTx({ userId: user.id, description: "Mercado del mes", categoryId: mercado.id, amount: 600000, occurredOn: "2026-09-20" });

    const report = await getReport(user.id, reportPeriod(undefined, october), october);

    expect(report.activeMonths).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
    expect(report.series).toHaveLength(12);
    expect(report.series.at(-2)).toEqual({ month: m(9), income: 4000000, expense: 2400000, balance: 1600000 });
    expect(report.summary).toMatchObject({
      income: 16000000,
      expense: 7800000,
      balance: 8200000,
      saved: "51",
      // De julio a septiembre (octubre va en curso).
      averageExpense: { amount: 2000000, months: 3, withoutCurrent: true },
      topMonth: { month: m(9), expense: 2400000 },
    });
    expect(report.categories.compared).toEqual(m(9));
    expect(report.categories.rows.map((r) => [r.name, r.total, r.change?.text])).toEqual([
      ["Vivienda", 7200000, "En septiembre, igual que su promedio"],
      ["Mercado", 600000, "Nueva en septiembre"],
    ]);
    expect(report.recurring).toEqual({
      items: [{ description: "Arriendo", emoji: vivienda.emoji, amount: 1800000, months: 4 }],
      total: 1800000,
    });
    // El arriendo es fijo: no está entre los más grandes.
    expect(report.biggest.map((r) => [r.description, r.amount])).toEqual([["Mercado del mes", 600000]]);
  });

  it("solo con los movimientos propios: los de otra cuenta no aparecen en nada", async () => {
    const ana = await createUser();
    const beto = await createUser();
    for (const month of ["08", "09", "10"]) {
      await addTx({ userId: beto.id, description: "Arriendo de Beto", amount: 999999, occurredOn: `2026-${month}-05` });
    }
    await addTx({ userId: ana.id, description: "Mercado", amount: 1000, occurredOn: "2026-10-05" });

    const report = await getReport(ana.id, reportPeriod(undefined, october), october);
    expect(report.activeMonths).toEqual(["2026-10"]);
    expect(report.summary).toMatchObject({ income: 0, expense: 1000 });
    expect(report.categories.rows.map((r) => r.total)).toEqual([1000]);
    expect(report.recurring.items).toEqual([]);
    expect(report.biggest.map((r) => r.description)).toEqual(["Mercado"]);
  });

  it("sin movimientos, todo en cero", async () => {
    const user = await createUser();
    const report = await getReport(user.id, reportPeriod("2025", october), october);
    expect(report.activeMonths).toEqual([]);
    expect(report.series.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
    expect(report.summary).toMatchObject({ income: 0, expense: 0, balance: 0, saved: null, averageExpense: null, topMonth: null });
    expect(report.categories.rows).toEqual([]);
    expect(report.recurring).toEqual({ items: [], total: 0 });
    expect(report.biggest).toEqual([]);
  });

  it("las categorías se comparan con meses de antes del período (un año que recién empieza)", async () => {
    const user = await createUser();
    const mercado = await globalCategory("Mercado");
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 100, occurredOn: "2025-12-10" });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 150, occurredOn: "2026-01-10" });
    await addTx({ userId: user.id, categoryId: mercado.id, amount: 10, occurredOn: "2026-02-10" });

    const report = await getReport(user.id, reportPeriod("2026", m(2)), m(2));
    expect(report.categories.compared).toEqual(m(1));
    expect(report.categories.averaged).toEqual([m(12, 2025)]);
    expect(report.categories.rows[0]).toMatchObject({ total: 160, change: { text: "En enero, 50% más que su promedio" } });
  });
});
