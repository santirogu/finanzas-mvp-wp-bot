import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { type MonthFixed, monthRemaining, remainingView } from "../src/modules/reports/remaining";
import { e2eDatabaseUrl } from "./database-url";
import { register, test, visible } from "./helpers";

// "Lo que te queda este mes" en el Resumen, de punta a punta: con un arriendo pagado el 1 de los tres meses
// anteriores (este mes falta), un internet pagado el 1 de los cuatro (ya pagado), un sueldo y un mercado de este
// mes. Lo que debe decir cada línea lo calculan las funciones de src/modules/reports/remaining.ts (con sus pruebas):
// las cifras dependen del día de hoy.

const today = todayInTimezone("America/Bogota");
const current = monthOf(today);
const dayOne = (month: { year: number; month: number }) => `${monthParam(month)}-01`;
const before = [3, 2, 1].map((n) => dayOne(shiftMonth(current, -n)));

async function seed(email: string) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  const add = (type: "income" | "expense", amount: number, description: string, date: string) =>
    sql`insert into transaction (user_id, type, amount, description, occurred_on) values (${id}, ${type}, ${amount}, ${description}, ${date})`;
  for (const date of before) {
    await add("expense", 1000000, "Arriendo", date);
    await add("expense", 100000, "Internet", date);
  }
  await add("expense", 100000, "Internet", dayOne(current));
  await add("expense", 200000, "Mercado", dayOne(current));
  await add("income", 3000000, "Sueldo", dayOne(current));
  await sql.end();
}

const region = (page: Page) => visible(page.getByRole("region", { name: "Lo que te queda este mes" }));
const spaces = (text: string) => text.replace(/ /g, " ");

test("Lo que te queda este mes: lo libre, por día, de dónde sale y el cierre; solo con el mes en curso y con ingresos @principal", async ({ page }) => {
  const { email } = await register(page);

  await test.step("sin ingresos este mes, no aparece", async () => {
    await page.goto("/dashboard");
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
    await expect(region(page)).toHaveCount(0);
  });

  await test.step("con el sueldo, los fijos y un mercado, las cifras de hoy", async () => {
    await seed(email);
    await page.goto("/dashboard");
    const fixed: MonthFixed = { pending: [{ description: "Arriendo", amount: 1000000 }], paid: 100000, hasFixed: true };
    const totals = { income: 3000000, expense: 300000 };
    const view = remainingView(monthRemaining(totals, fixed, today), totals, fixed, today, "COP");
    const card = region(page);
    await expect(card.getByRole("heading", { level: 2 })).toHaveText("Lo que te queda este mes");
    await expect(card).toContainText(view.label);
    await expect(card).toContainText("$1.700.000,00");
    await expect(card).toContainText(spaces(view.note));
    await expect(card).toContainText(spaces(view.dayOf));
    for (const row of view.rows) {
      await expect(card.locator("dl > div", { hasText: row.label })).toContainText(spaces(row.amount));
    }
    await expect(card.locator("dl > div", { hasText: "Fijos que faltan (1)" })).toContainText("Arriendo");
    if (view.projection) await expect(card).toContainText(spaces(view.projection));
    else await expect(card).not.toContainText("A este ritmo");

    const { violations } = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  await test.step("con otro mes, no aparece: es de ahora", async () => {
    await page.goto(`/dashboard?mes=${monthParam(shiftMonth(current, -1))}`);
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
    await expect(region(page)).toHaveCount(0);
  });
});
