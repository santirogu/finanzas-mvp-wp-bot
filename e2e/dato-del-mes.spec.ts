import { expect } from "@playwright/test";
import { formatMonthName, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { seriousViolations } from "./admin";
import { addTransaction, register, test, toast, visible } from "./helpers";

// El dato del mes del Resumen: la categoría que más se salió de lo normal a esta altura del mes, frente a los mismos
// días de los meses anteriores, con el enlace a las categorías de Reportes.

const today = todayInTimezone("America/Bogota");
const previous = shiftMonth(monthOf(today), -1);

test("el Resumen dice qué categoría se salió de lo normal a esta altura del mes, y lleva a Reportes @principal", async ({ page }) => {
  await register(page);

  await test.step("sin meses anteriores, no hay dato", async () => {
    await page.goto("/dashboard");
    await expect(visible(page.getByRole("region", { name: "Dato del mes" }))).toHaveCount(0);
  });

  await test.step("con un mercado el día 1 del mes pasado y uno más grande este mes, sale Alimentación", async () => {
    await page.goto("/egresos");
    // El día 1 siempre está "a esta altura", sea el día que sea hoy.
    await addTransaction(page, { amount: "50000", description: "Mercado del mes pasado", category: "Alimentación", date: `${monthParam(previous)}-01` });
    // De otro mes, el aviso lo dice ("Egreso registrado en septiembre").
    await expect(toast(page, /^Egreso registrado en /)).toBeVisible();
    await addTransaction(page, { amount: "150000", description: "Mercado grande", category: "Alimentación" });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();

    await page.goto("/dashboard");
    const fact = visible(page.getByRole("region", { name: "Dato del mes" }));
    await expect(fact).toContainText(`Alimentación: llevas $150.000,00, 200 % más que a esta altura de ${formatMonthName(previous)}.`);
    expect(await seriousViolations(page)).toEqual([]);
    await fact.getByRole("link", { name: "Ver en Reportes" }).click();
    await expect(page).toHaveURL(/\/reportes#categorias$/);
    await expect(visible(page.getByRole("region", { name: "Egresos por categoría" }))).toBeInViewport();
  });
});
