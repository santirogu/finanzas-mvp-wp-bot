import { expect, type Page } from "@playwright/test";
import { formatMonthName, monthOf, todayInTimezone } from "../src/lib/dates";
import { seriousViolations } from "./admin";
import { addBudget, addTransaction, register, test, toast, visible } from "./helpers";

// Los presupuestos de punta a punta: la invitación del Resumen, ponerlos (con el error de un campo vacío), el aviso al
// registrar el egreso que llega al 80 %, cómo van en Configuración y en el Resumen, cambiarlos y quitarlos.

const month = formatMonthName(monthOf(todayInTimezone("America/Bogota")));
const row = (page: Page, name: string) => visible(page.getByRole("main").getByRole("listitem").filter({ hasText: name }));
const resumenCard = (page: Page) => visible(page.getByRole("region", { name: `Presupuestos de ${month}` }));

test("Presupuestos: ponerlos, cómo van en el Resumen, cambiarlos y quitarlos @principal", async ({ page }) => {
  await register(page);

  await test.step("sin presupuestos, el Resumen invita a ponerlos", async () => {
    await page.goto("/dashboard");
    await visible(page.getByRole("link", { name: "Ponle un presupuesto a tus categorías" })).click();
    await expect(page).toHaveURL(/\/configuracion#presupuestos$/);
    await expect(visible(page.getByRole("heading", { level: 1, name: "Configuración" }))).toBeVisible();
    await expect(visible(page.getByRole("region", { name: "Presupuestos" }))).toBeVisible();
    await expect(visible(page.getByText("Todavía no tienes presupuestos."))).toBeVisible();
  });

  await test.step("sin monto, el error va debajo del campo", async () => {
    await visible(page.getByRole("button", { name: "Agregar un presupuesto" })).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Categoría")).toBeFocused();
    const select = dialog.getByLabel("Categoría");
    await select.selectOption((await select.locator("option", { hasText: "Alimentación" }).getAttribute("value")) ?? "");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog.getByText("Escribe el monto.")).toBeVisible();
    await expect(dialog.getByLabel("Monto por mes")).toHaveAttribute("aria-invalid", "true");
    expect(await seriousViolations(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("con un presupuesto y un egreso de esa categoría, cuánto lleva y cuánto le queda", async () => {
    await addBudget(page, "Alimentación", "100000");
    await page.goto("/egresos");
    await addTransaction(page, { amount: "85000", description: "Almuerzos de la semana", category: "Alimentación" });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
    // Con este egreso llegó al 85 %: el aviso queda a la vista, con el enlace a los presupuestos.
    const notice = visible(page.getByRole("status").filter({ hasText: "Alimentación: llevas" }));
    await expect(notice).toContainText("Alimentación: llevas $85.000,00 de $100.000,00 (85 %)");
    await expect(notice.getByRole("link", { name: "Ver presupuestos" })).toHaveAttribute("href", "/configuracion#presupuestos");
    expect(await seriousViolations(page)).toEqual([]);

    // La dirección de antes lleva a la sección de Configuración.
    await page.goto("/presupuestos");
    await expect(page).toHaveURL(/\/configuracion#presupuestos$/);
    await expect(row(page, "Alimentación")).toContainText("$85.000,00 de $100.000,00");
    await expect(row(page, "Alimentación")).toContainText("85 %");
    await expect(row(page, "Alimentación")).toContainText("Te quedan $15.000,00");
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto("/dashboard");
    await expect(resumenCard(page)).toContainText("Alimentación");
    await expect(resumenCard(page)).toContainText("Te quedan $15.000,00");
    await expect(page.getByRole("link", { name: "Ponle un presupuesto a tus categorías" })).toHaveCount(0);
    await resumenCard(page).getByRole("link", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/configuracion#presupuestos$/);
  });

  await test.step("cambiarlo: con el monto de antes en el campo; si se pasa, por cuánto", async () => {
    await visible(page.getByRole("button", { name: "Cambiar el presupuesto de Alimentación" })).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Monto por mes")).toHaveValue("100.000,00");
    await dialog.getByLabel("Monto por mes").fill("50000");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se cambió el presupuesto de Alimentación: $50.000,00 al mes")).toBeFocused();
    await expect(row(page, "Alimentación")).toContainText("170 %");
    await expect(row(page, "Alimentación")).toContainText("Te pasaste por $35.000,00");

    // Ya no se ofrece para uno nuevo.
    await visible(page.getByRole("button", { name: "Agregar un presupuesto" })).click();
    await expect(page.getByRole("dialog").getByLabel("Categoría").locator("option", { hasText: "Alimentación" })).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("quitarlo: el aviso recibe el foco y el Resumen vuelve a invitar", async () => {
    await visible(page.getByRole("button", { name: "Quitar el presupuesto de Alimentación" })).click();
    await expect(toast(page, "Se quitó el presupuesto de Alimentación")).toBeFocused();
    await expect(visible(page.getByText("Todavía no tienes presupuestos."))).toBeVisible();
    await page.goto("/dashboard");
    await expect(resumenCard(page)).toHaveCount(0);
    await expect(visible(page.getByRole("link", { name: "Ponle un presupuesto a tus categorías" }))).toBeVisible();
  });
});
