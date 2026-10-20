import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { formatMonthName, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { dateInMonth, daysBetween, usualDay, whenLabel } from "../src/modules/reports/upcoming";
import { e2eDatabaseUrl } from "./database-url";
import { closeToasts, openTab, register, test, toast, visible } from "./helpers";

// Los avisos de próximos pagos del Resumen de punta a punta: con gastos fijos pagados los tres meses
// anteriores (cargados en la base: por la app serían decenas de registros), los que tocan en los próximos
// días y los atrasados, "Mostrar más" y "Este pago ya no aplica". Las fechas salen de hoy: lo que se
// espera de cada una lo calculan las funciones de src/modules/reports/upcoming.ts (con sus pruebas).

const today = todayInTimezone("America/Bogota");

/** La fecha `days` días después de hoy (o antes, si es negativo). */
function shiftDay(days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Los pagos de los tres meses anteriores al de `due`, el mismo día del mes (o el último, si el mes es más corto). */
function paymentsFor(due: string) {
  const day = Number(due.slice(8, 10));
  return [3, 2, 1].map((n) => dateInMonth(monthParam(shiftMonth(monthOf(due), -n)), day));
}

/** Lo que el aviso debe decir de un gasto que se pagó en `payments`: su fecha esperada y cuándo es. */
function expected(payments: string[], month: string) {
  const date = dateInMonth(month, usualDay(payments));
  return { date, when: whenLabel(daysBetween(today, date)) };
}

async function addPayments(email: string, payments: { description: string; amount: number; dates: string[] }[]) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  for (const { description, amount, dates } of payments) {
    for (const date of dates) {
      await sql`insert into transaction (user_id, type, amount, description, occurred_on) values (${id}, 'expense', ${amount}, ${description}, ${date})`;
    }
  }
  await sql.end();
}

const card = (page: Page) => visible(page.getByRole("region", { name: "Próximos pagos" }));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Próximos pagos: los que tocan pronto y los atrasados, Mostrar más y Este pago ya no aplica @principal", async ({ page }) => {
  const { email } = await register(page);
  // El arriendo toca en dos días; seis servicios, mañana; el gimnasio se debía pagar hace cinco días.
  const rentDue = shiftDay(2);
  const gymDue = shiftDay(-5);
  const rent = paymentsFor(rentDue);
  const gym = paymentsFor(gymDue);
  const services = ["Agua", "Gas", "Internet", "Luz", "Celular", "Netflix"].map((name) => ({
    description: name,
    amount: 50000,
    dates: paymentsFor(shiftDay(1)),
  }));
  await addPayments(email, [
    { description: "Arriendo", amount: 1800000, dates: rent },
    { description: "Gimnasio", amount: 120000, dates: gym },
    ...services,
  ]);
  // El gimnasio, agregado a mano: si hace cinco días fue el mes pasado, sus pagos quedan fuera de los
  // últimos cuatro meses en que se detectan solos.
  await openTab(page, "Fijos");
  const fixed = visible(page.getByRole("region", { name: "Gastos fijos" }));
  if (!(await fixed.getByRole("button", { name: /^Historial de Gimnasio/ }).count())) {
    await fixed.getByRole("button", { name: "Agregar un gasto fijo" }).click();
    await fixed.getByLabel("Egreso", { exact: true }).selectOption("Gimnasio");
    await fixed.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(toast(page, "Se agregó «Gimnasio» a los gastos fijos")).toBeVisible();
    await closeToasts(page);
  }
  await openTab(page, "Resumen");

  await test.step("el atrasado primero, en rojo; después el arriendo y los servicios, con su fecha y su monto", async () => {
    const items = card(page).getByRole("listitem");
    await expect(items).toHaveCount(5);
    const gymExpected = expected(gym, gymDue.slice(0, 7));
    await expect(items.first()).toContainText("Gimnasio");
    await expect(items.first().getByText(gymExpected.when, { exact: true })).toHaveClass(/text-danger/);
    await expect(items.first()).toContainText("≈ −$120.000,00");
    const rentItem = card(page).getByRole("listitem").filter({ hasText: "Arriendo" });
    const rentExpected = expected(rent, rentDue.slice(0, 7));
    // El arriendo va después de los servicios (mañana): con "Mostrar más" se ve.
    await card(page).getByRole("button", { name: "Mostrar 3 más" }).click();
    await expect(items).toHaveCount(8);
    await expect(rentItem).toContainText(`lo sueles pagar el ${usualDay(rent)}`);
    await expect(rentItem).toContainText("≈ −$1.800.000,00");
    await expect(rentItem.getByText(rentExpected.when, { exact: true })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await card(page).getByRole("button", { name: "Mostrar menos" }).click();
    await expect(items).toHaveCount(5);
  });

  await test.step("Este pago ya no aplica: el del gimnasio de ese mes ya no se muestra, tampoco al volver", async () => {
    const month = formatMonthName(monthOf(gymDue), { withYear: gymDue.slice(0, 4) !== today.slice(0, 4) });
    await card(page).getByRole("button", { name: `El pago de ${month} de Gimnasio ya no aplica` }).click();
    await expect(toast(page, `No se avisará del pago de ${formatMonthName(monthOf(gymDue))} de «Gimnasio»`)).toHaveAttribute("data-tone", "removal");
    await expect(card(page).getByRole("listitem").filter({ hasText: "Gimnasio" })).toHaveCount(0);
    await page.reload();
    await expect(card(page).getByRole("listitem").filter({ hasText: "Gimnasio" })).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Mostrar 2 más" })).toBeVisible();
  });

  await test.step("Ver gastos fijos lleva a Fijos; en el Resumen de otro mes no hay avisos", async () => {
    await card(page).getByRole("link", { name: "Ver gastos fijos" }).click();
    await expect(page).toHaveURL(/\/gastos-fijos$/);
    await page.goto(`/dashboard?mes=${monthParam(shiftMonth(monthOf(today), -1))}`);
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});

test("sin gastos fijos, el Resumen no muestra la tarjeta", async ({ page }) => {
  await register(page);
  await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("los avisos se leen bien en modo oscuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { email } = await register(page);
  await addPayments(email, [
    { description: "Arriendo", amount: 1800000, dates: paymentsFor(shiftDay(1)) },
    { description: "Gimnasio", amount: 120000, dates: paymentsFor(shiftDay(-3)) },
  ]);
  await page.reload();
  await expect(card(page).getByRole("listitem").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
