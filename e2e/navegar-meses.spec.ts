import { expect, type Page } from "@playwright/test";
import {
  formatMonthLabel,
  formatMonthName,
  monthOf,
  monthParam,
  sameDayIn,
  shiftMonth,
  todayInTimezone,
  type Month,
} from "../src/lib/dates";
import { seriousViolations } from "./admin";
import { addTransaction, openTab, register, test, toast, visible } from "./helpers";

// El Resumen, Ingresos y Egresos muestran el mes que pide la URL (?mes=2026-09): con las flechas, la
// tarjeta del año o "Volver al mes actual". Las fechas salen de hoy en Bogotá (la zona de las cuentas nuevas).

const today = todayInTimezone("America/Bogota");
const current = monthOf(today);
const previous = shiftMonth(current, -1);
const twoBefore = shiftMonth(current, -2);
const dayOf = (month: Month, day: number) => `${monthParam(month)}-${String(day).padStart(2, "0")}`;
/** "septiembre" o, si es de otro año que el actual, "septiembre de 2025" (como lo dicen las frases). */
const nameOf = (month: Month) => formatMonthName(month, { withYear: month.year !== current.year });

const text = (page: Page, value: string | RegExp) => visible(page.getByText(value));
/**
 * La tarjeta del Resumen con ese título ("Balance del mes", "Ingresos", "Egresos"). El título es un
 * párrafo: el "Egresos" del centro de la dona de "Gastos por categoría" no cuenta.
 */
const card = (page: Page, title: string) =>
  visible(page.locator(".card").filter({ has: page.locator(`p:text-is("${title}")`) }));
// Las filas de la lista (en la página, no en los avisos emergentes, que también son elementos de lista).
const row = (page: Page, description: string) =>
  visible(page.getByRole("main").getByRole("listitem").filter({ hasText: description }));

/** Espera la página del mes (el título, sin el esqueleto de carga). */
async function expectMonth(page: Page, month: Month, path: string) {
  const query = monthParam(month) === monthParam(current) ? "" : `\\?mes=${monthParam(month)}`;
  await expect(page).toHaveURL(new RegExp(`${path}${query}$`));
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
  await expect(visible(page.getByRole("button", { name: formatMonthLabel(month), exact: true }))).toBeVisible();
}

test("ver otros meses en el Resumen, Ingresos y Egresos @principal", async ({ page }) => {
  await register(page);

  await test.step("un movimiento de otro mes avisa dónde quedó", async () => {
    await openTab(page, "Ingresos");
    await addTransaction(page, { amount: "2000000", description: "Sueldo anterior", date: dayOf(previous, 15) });
    await expect(toast(page, `Ingreso registrado en ${formatMonthName(previous, { withYear: true })}`)).toBeVisible();
    await openTab(page, "Egresos");
    await addTransaction(page, { amount: "500000", description: "Mercado anterior", date: dayOf(previous, 20) });
    await expect(toast(page, `Egreso registrado en ${formatMonthName(previous, { withYear: true })}`)).toBeVisible();
    await addTransaction(page, { amount: "100000", description: "Cine de hace dos meses", date: dayOf(twoBefore, 10) });
    await expect(toast(page, `Egreso registrado en ${formatMonthName(twoBefore, { withYear: true })}`)).toBeVisible();
    await addTransaction(page, { amount: "575000", description: "Mercado de hoy", date: today });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
    await expect(text(page, "1 movimiento este mes")).toBeVisible();
  });

  await test.step("el Resumen compara cada total con el mes anterior", async () => {
    await openTab(page, "Resumen");
    await expectMonth(page, current, "/dashboard");
    const before = nameOf(previous);
    await expect(card(page, "Balance del mes")).toContainText("−$575.000,00");
    await expect(card(page, "Balance del mes")).toContainText(`$2.075.000,00 menos que ${before}`);
    await expect(card(page, "Ingresos")).toContainText(`100% menos que ${before}`);
    await expect(card(page, "Egresos")).toContainText(`15% más que ${before}`);
    // En el mes actual, la flecha siguiente está apagada y no hace falta "Volver al mes actual".
    await expect(visible(page.getByRole("link", { name: "Mes siguiente", exact: true }))).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("link", { name: "Volver al mes actual" })).toHaveCount(0);
  });

  await test.step("la flecha lleva al mes anterior, con sus movimientos y su comparación", async () => {
    await visible(page.getByRole("link", { name: `Mes anterior: ${formatMonthName(previous, { withYear: true })}` })).click();
    await expectMonth(page, previous, "/dashboard");
    const recent = visible(page.locator("section", { hasText: "Últimos movimientos" }));
    await expect(recent.getByRole("heading")).toHaveText(`Últimos movimientos de ${nameOf(previous)}`);
    await expect(recent).toContainText("Sueldo anterior");
    await expect(recent).toContainText("Mercado anterior");
    await expect(recent).not.toContainText("Mercado de hoy");
    const before = nameOf(twoBefore);
    await expect(card(page, "Balance del mes")).toContainText(`$1.600.000,00 más que ${before}`);
    await expect(card(page, "Ingresos")).toContainText(`Sin ingresos en ${before}`);
    await expect(card(page, "Egresos")).toContainText(`400% más que ${before}`);
  });

  await test.step("las pestañas siguen en ese mes, y el formulario propone una fecha de ese mes", async () => {
    await openTab(page, "Egresos");
    await expectMonth(page, previous, "/egresos");
    await expect(visible(page.getByLabel("Fecha"))).toHaveValue(sameDayIn(previous, today));
    await expect(text(page, `1 movimiento en ${nameOf(previous)}`)).toBeVisible();
    await expect(row(page, "Mercado anterior")).toContainText("−$500.000,00");
  });

  await test.step("borrar y deshacer dejan la lista en ese mes", async () => {
    await visible(page.getByRole("button", { name: "Eliminar Mercado anterior" })).click();
    await expect(toast(page, "Se borró «Mercado anterior»")).toBeFocused();
    // El aviso venía en la URL (?borrado=) y se quita: queda la lista de ese mes.
    await expect(page).toHaveURL(new RegExp(`/egresos\\?mes=${monthParam(previous)}$`));
    await expect(text(page, `No registraste egresos en ${nameOf(previous)}.`)).toBeVisible();
    await toast(page, "Se borró").getByRole("button", { name: "Deshacer" }).click();
    await expect(toast(page, "Se restauró «Mercado anterior»")).toBeFocused();
    await expectMonth(page, previous, "/egresos");
    await expect(row(page, "Mercado anterior")).toBeVisible();
  });

  await test.step("la tarjeta del año lleva a cualquier mes, tenga o no movimientos", async () => {
    const card = visible(page.getByRole("group", { name: "Elegir un mes" }));
    const withMovements = (month: Month) => `${formatMonthName(month, { withYear: true })}, con movimientos`;
    await visible(page.getByRole("button", { name: formatMonthLabel(previous), exact: true })).click();
    await expect(card.getByText(String(previous.year), { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: withMovements(previous) })).toHaveAttribute("aria-current", "page");
    expect(await seriousViolations(page)).toEqual([]);

    // Hace dos meses (en enero y febrero, del año anterior).
    if (twoBefore.year !== previous.year) await card.getByRole("button", { name: /^Año anterior/ }).click();
    await card.getByRole("link", { name: withMovements(twoBefore) }).click();
    await expectMonth(page, twoBefore, "/egresos");
    await expect(row(page, "Cine de hace dos meses")).toBeVisible();

    // El mismo mes del año pasado, sin movimientos: se cambia de año en la tarjeta.
    const lastYear = { year: current.year - 1, month: current.month };
    await visible(page.getByRole("button", { name: formatMonthLabel(twoBefore), exact: true })).click();
    if (twoBefore.year !== lastYear.year) await card.getByRole("button", { name: /^Año anterior/ }).click();
    await card.getByRole("link", { name: formatMonthName(lastYear, { withYear: true }), exact: true }).click();
    await expectMonth(page, lastYear, "/egresos");
    await expect(text(page, `No registraste egresos en ${nameOf(lastYear)}.`)).toBeVisible();

    // Y la flecha sigue hacia atrás aunque no haya movimientos.
    const before = shiftMonth(lastYear, -1);
    await visible(page.getByRole("link", { name: `Mes anterior: ${formatMonthName(before, { withYear: true })}` })).click();
    await expectMonth(page, before, "/egresos");
  });

  await test.step("'Volver al mes actual' lleva a este mes, y la fecha vuelve a ser hoy", async () => {
    await visible(page.getByRole("link", { name: "Volver al mes actual" })).click();
    await expectMonth(page, current, "/egresos");
    await expect(row(page, "Mercado de hoy")).toBeVisible();
    await expect(visible(page.getByLabel("Fecha"))).toHaveValue(today);
  });
});

test("un mes futuro o inválido en la URL muestra el actual; sin movimientos, la flecha anterior funciona", async ({ page }) => {
  await register(page);
  for (const mes of [monthParam(shiftMonth(current, 1)), "2026-13", "septiembre"]) {
    await page.goto(`/dashboard?mes=${mes}`);
    await expect(visible(page.getByRole("heading", { level: 1 }))).toHaveText(formatMonthLabel(current));
    await expect(page.getByRole("link", { name: "Volver al mes actual" })).toHaveCount(0);
  }
  // Sin movimientos, la flecha anterior igual lleva al mes anterior.
  await expect(
    visible(page.getByRole("link", { name: `Mes anterior: ${formatMonthName(previous, { withYear: true })}` })),
  ).toHaveAttribute("href", `/dashboard?mes=${monthParam(previous)}`);
});
