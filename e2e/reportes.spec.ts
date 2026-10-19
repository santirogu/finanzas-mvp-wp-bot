import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { formatMonthLabel, formatMonthName, formatShortDate, type Month, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { e2eDatabaseUrl } from "./database-url";
import { addTransaction, closeToasts, openTab, register, test, toast, visible } from "./helpers";

// Reportes de punta a punta: con los movimientos de cuatro meses, las cifras del período, el gráfico
// (que lleva al Resumen de cada mes), las categorías frente a su promedio, los gastos fijos y el
// cambio de período.

const current = monthOf(todayInTimezone("America/Bogota"));
const [m1, m2, m3] = [1, 2, 3].map((n) => shiftMonth(current, -n));
const dayOf = (month: Month, day: number) => `${monthParam(month)}-${String(day).padStart(2, "0")}`;
const name = (month: Month) => formatMonthName(month);

type Movement = Parameters<typeof addTransaction>[1];

/** Registra un movimiento desde la pestaña actual y espera su aviso (de otro mes, dice en cuál quedó). */
async function add(page: Page, kind: "Ingreso" | "Egreso", movement: Movement, month?: Month) {
  await addTransaction(page, movement);
  await expect(toast(page, month ? `${kind} registrado en ${formatMonthName(month, { withYear: true })}` : new RegExp(`^${kind} registrado$`))).toBeVisible();
  // Así el aviso del siguiente, aunque diga lo mismo, es otro.
  await closeToasts(page);
}

const section = (page: Page, title: string) => visible(page.getByRole("region", { name: title }));
const stat = (page: Page, label: string) =>
  visible(page.getByRole("region", { name: "Resumen del período" }).locator(".card").filter({ has: page.getByText(label, { exact: true }) }));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Reportes: las cifras del período, el gráfico, las categorías y los gastos fijos @principal", async ({ page }) => {
  await register(page);

  await test.step("cuatro meses de movimientos", async () => {
    await openTab(page, "Ingresos");
    await add(page, "Ingreso", { amount: "4000000", description: "Salario", category: "Salario", date: dayOf(m1, 15) }, m1);
    await add(page, "Ingreso", { amount: "4000000", description: "Salario", category: "Salario" });
    await openTab(page, "Egresos");
    for (const month of [m3, m2, m1]) {
      await add(page, "Egreso", { amount: "1800000", description: "Arriendo", category: "Vivienda", date: dayOf(month, 5) }, month);
    }
    await add(page, "Egreso", { amount: "100000", description: "Restaurante con amigos", category: "Alimentación", date: dayOf(m1, 10) }, m1);
    // El de este mes, escrito distinto: es el mismo gasto fijo.
    await add(page, "Egreso", { amount: "1800000", description: "arriendo ", category: "Vivienda" });
  });

  await test.step("las cifras de los últimos 12 meses", async () => {
    await openTab(page, "Reportes");
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(visible(page.getByRole("link", { name: "Últimos 12 meses" }))).toHaveAttribute("aria-current", "page");
    const range = `De ${formatMonthName(shiftMonth(current, -11), { withYear: true })} a ${formatMonthName(current, { withYear: true })}`;
    await expect(visible(page.getByText(range))).toBeVisible();

    await expect(stat(page, "Ingresos")).toContainText("$8.000.000,00");
    await expect(stat(page, "Egresos")).toContainText("$7.300.000,00");
    await expect(stat(page, "Balance del período")).toContainText("$700.000,00");
    await expect(stat(page, "Balance del período")).toContainText("Ahorraste el 9% de tus ingresos");
    // Los tres meses completos (el actual va en curso): (1.800.000 + 1.800.000 + 1.900.000) / 3.
    await expect(stat(page, "Gasto promedio por mes")).toContainText("$1.833.333,33");
    await expect(stat(page, "Gasto promedio por mes")).toContainText(`En 3 meses, sin ${name(current)} (va en curso)`);
    await expect(stat(page, "El mes de más gasto")).toContainText(formatMonthLabel(m1));
    await expect(stat(page, "El mes de más gasto")).toContainText("$1.900.000,00");
  });

  await test.step("cada categoría, frente a su promedio", async () => {
    const categories = section(page, "Gastos por categoría");
    await expect(categories).toContainText(`cómo te fue en ${name(m1)} frente a su promedio de ${name(m3)} y ${name(m2)}`);
    const rows = categories.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Vivienda");
    await expect(rows.nth(0)).toContainText("$7.200.000,00 · 99%");
    await expect(rows.nth(0)).toContainText(`En ${name(m1)}, igual que su promedio`);
    await expect(rows.nth(1)).toContainText("Alimentación");
    await expect(rows.nth(1)).toContainText(`Nueva en ${name(m1)}`);
  });

  await test.step("el arriendo es un gasto fijo (escrito como la última vez)", async () => {
    const fixed = section(page, "Gastos fijos");
    const items = fixed.getByRole("listitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("arriendo");
    await expect(items.first()).toContainText("En 4 de 12 meses");
    await expect(items.first()).toContainText("−$1.800.000,00");
    await expect(fixed).toContainText("Total al mes−$1.800.000,00");
    await expect(fixed).toContainText("Son el 98% de tu gasto promedio por mes.");
  });

  await test.step("los gastos más grandes, sin el arriendo (es fijo); tocar uno lleva a editarlo", async () => {
    const biggest = section(page, "Los gastos más grandes");
    const items = biggest.getByRole("listitem");
    await expect(items).toHaveCount(1);
    const date = formatShortDate(dayOf(m1, 10), { withYear: m1.year !== current.year });
    await expect(items.first()).toContainText(`Restaurante con amigos${date} · Alimentación−$100.000,00`);
    await items.first().getByRole("link", { name: /^Editar .*Restaurante con amigos/ }).click();
    await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
    await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Restaurante con amigos");
    await page.goBack();
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(section(page, "Los gastos más grandes")).toBeVisible();
  });

  await test.step("la tabla mes a mes y, al tocar un mes del gráfico, su Resumen", async () => {
    const byMonth = section(page, "Ingresos y egresos por mes");
    await byMonth.getByText("Ver mes a mes").click();
    // Una fila de la tabla (desde 640 px) o, en el celular, el mes con sus montos debajo.
    const row = visible(byMonth.locator("tr, li").filter({ hasText: formatMonthLabel(m1) }));
    await expect(row).toContainText("$4.000.000,00");
    await expect(row).toContainText("$1.900.000,00");
    await expect(row).toContainText("$2.100.000,00");

    const bar = byMonth.getByRole("link", {
      name: `${formatMonthLabel(m1)}: ingresos $4.000.000,00, egresos $1.900.000,00, balance $2.100.000,00`,
    });
    await bar.hover();
    await expect(byMonth).toContainText(`${formatMonthLabel(m1)} · Ingresos $4.000.000,00 · Egresos $1.900.000,00`);
    await bar.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?mes=${monthParam(m1)}$`));
    await expect(visible(page.getByRole("button", { name: formatMonthLabel(m1), exact: true }))).toBeVisible();
    // Desde ahí, la pestaña Reportes vuelve a los 12 meses (no lleva el mes).
    await openTab(page, "Reportes");
    await expect(page).toHaveURL(/\/reportes$/);
  });

  await test.step("otro período: el año en curso", async () => {
    const year = visible(page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: String(current.year), exact: true }));
    await year.click();
    await expect(page).toHaveURL(new RegExp(`/reportes\\?periodo=${current.year}$`));
    await expect(year).toHaveAttribute("aria-current", "page");
    const range = current.month === 1 ? formatMonthLabel(current) : `De enero a ${formatMonthName(current, { withYear: true })}`;
    await expect(visible(page.getByText(range, { exact: true }))).toBeVisible();
  });
});

test("con más de 10 gastos, los demás se abren con «Ver los N siguientes»", async ({ page }) => {
  const { email } = await register(page);
  // 13 egresos distintos de hoy, cargados en la base de las E2E (por la app serían 13 registros).
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  for (let i = 1; i <= 13; i++) {
    await sql`insert into transaction (user_id, type, amount, description, occurred_on)
              values (${id}, 'expense', ${i * 1000}, ${`Gasto número ${i}`}, ${todayInTimezone("America/Bogota")})`;
  }
  await sql.end();

  await openTab(page, "Reportes");
  const biggest = section(page, "Los gastos más grandes");
  const links = biggest.getByRole("link", { name: /^Editar / });
  await expect(visible(links)).toHaveCount(10);
  await expect(visible(links).first()).toContainText("Gasto número 13");
  await biggest.getByText("Ver los 3 siguientes").click();
  await expect(visible(links)).toHaveCount(13);
  await expect(visible(links).last()).toContainText("Gasto número 1");
  await expect(visible(links).last()).toContainText("Sin categoría");
});

test("Reportes sin movimientos lo explica", async ({ page }) => {
  await register(page);
  await openTab(page, "Reportes");
  await expect(visible(page.getByText("Aún no tienes movimientos."))).toBeVisible();
  await expect(visible(page.getByRole("navigation", { name: "Período" }).getByRole("link"))).toHaveCount(1);
  await expect(visible(page.getByRole("region", { name: "Gastos fijos" }))).toHaveCount(0);
});

test("un período mal escrito o futuro en la URL muestra los últimos 12 meses", async ({ page }) => {
  await register(page);
  for (const periodo of ["2999", "septiembre", "1999"]) {
    await page.goto(`/reportes?periodo=${periodo}`);
    await expect(visible(page.getByRole("link", { name: "Últimos 12 meses" }))).toHaveAttribute("aria-current", "page");
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Reportes con datos y la tabla abierta, sin problemas de accesibilidad en modo ${colorScheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await register(page);
    await openTab(page, "Egresos");
    for (const month of [m2, m1]) {
      await add(page, "Egreso", { amount: "250000", description: "Plan del celular", category: "Servicios", date: dayOf(month, 8) }, month);
    }
    await add(page, "Egreso", { amount: "250000", description: "Plan del celular", category: "Servicios" });
    await openTab(page, "Reportes");
    await expect(visible(page.getByRole("region", { name: "Gastos fijos" }).getByRole("listitem"))).toHaveCount(1);
    await visible(page.getByText("Ver mes a mes")).click();
    // Con el mouse en un mes: el detalle de abajo, en sus colores.
    await visible(page.getByRole("link", { name: new RegExp(`^${formatMonthLabel(m1)}:`) })).hover();
    expect(await seriousViolations(page)).toEqual([]);
  });
}
