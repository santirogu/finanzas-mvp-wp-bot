import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { formatMonthName, formatShortDate, type Month, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { addTransaction, closeToasts, openTab, register, test, toast, visible } from "./helpers";

// Fijos (/gastos-fijos) de punta a punta: los gastos fijos que se detectan solos, los que se quitan o se
// agregan a mano (y cómo eso cambia los gastos más grandes de Reportes, que los descuenta) y el historial
// del valor de cada uno, con sus notas.

const current = monthOf(todayInTimezone("America/Bogota"));
const [m1, m2, m3] = [1, 2, 3].map((n) => shiftMonth(current, -n));
const dayOf = (month: Month, day: number) => `${monthParam(month)}-${String(day).padStart(2, "0")}`;

type Movement = Parameters<typeof addTransaction>[1];

/** Registra un egreso desde Egresos y espera su aviso (de otro mes, dice en cuál quedó). */
async function addExpense(page: Page, movement: Movement, month?: Month) {
  await addTransaction(page, movement);
  await expect(toast(page, month ? `Egreso registrado en ${formatMonthName(month, { withYear: true })}` : /^Egreso registrado$/)).toBeVisible();
  await closeToasts(page);
}

const fixedList = (page: Page) => visible(page.getByRole("region", { name: "Gastos fijos" }));
const biggest = (page: Page) => visible(page.getByRole("region", { name: "Los egresos más grandes" }));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Fijos: los detectados solos, quitar, volver a poner, agregar y sacar (Reportes los descuenta) @principal", async ({ page }) => {
  await register(page);

  await test.step("cuatro meses de arriendo y un restaurante", async () => {
    await openTab(page, "Egresos");
    for (const month of [m3, m2, m1]) {
      await addExpense(page, { amount: "1800000", description: "Arriendo", category: "Vivienda", date: dayOf(month, 5) }, month);
    }
    await addExpense(page, { amount: "100000", description: "Restaurante con amigos", category: "Alimentación", date: dayOf(m1, 10) }, m1);
    // El de este mes, escrito distinto: es el mismo gasto fijo.
    await addExpense(page, { amount: "1800000", description: "arriendo ", category: "Vivienda" });
  });

  await test.step("la pestaña Fijos: el arriendo, escrito como la última vez, con el total y su parte del promedio", async () => {
    await openTab(page, "Fijos");
    await expect(page).toHaveURL(/\/gastos-fijos$/);
    await expect(visible(page.getByRole("heading", { level: 1, name: "Gastos fijos" }))).toBeVisible();
    await expect(visible(page.getByText("Los egresos con la misma descripción en al menos 3 de los últimos 4 meses, y los que agregaste tú."))).toBeVisible();
    const items = fixedList(page).getByRole("listitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("arriendo");
    await expect(items.first()).toContainText("En 4 de 12 meses");
    await expect(items.first()).toContainText("−$1.800.000,00");
    await expect(fixedList(page)).toContainText("Total al mes−$1.800.000,00");
    // Los tres meses completos: (1.800.000 + 1.800.000 + 1.900.000) / 3 = 1.833.333,33.
    await expect(fixedList(page)).toContainText("Son el 98 % de tu gasto promedio por mes.");
  });

  await test.step("quitar el arriendo: pasa a Quitados y Reportes lo cuenta entre los más grandes", async () => {
    await fixedList(page).getByRole("button", { name: "Quitar arriendo de los gastos fijos" }).click();
    await expect(toast(page, "Se quitó “arriendo” de los gastos fijos")).toHaveAttribute("data-tone", "removal");
    await expect(fixedList(page)).toContainText("Todavía no hay egresos que se repitan cada mes.");
    await closeToasts(page);
    await openTab(page, "Reportes");
    await expect(biggest(page)).toContainText("arriendo");
  });

  await test.step("volver a ponerlo", async () => {
    await openTab(page, "Fijos");
    await fixedList(page).getByText("Quitados (1)").click();
    await fixedList(page).getByRole("button", { name: "Volver a poner arriendo en los gastos fijos" }).click();
    await expect(toast(page, "Volvió “arriendo” a los gastos fijos")).toHaveAttribute("data-tone", "success");
    await expect(fixedList(page).getByRole("listitem")).toHaveCount(1);
    await closeToasts(page);
  });

  await test.step("agregar el restaurante (un solo mes): queda Agregado por ti y sale de los más grandes", async () => {
    await fixedList(page).getByRole("button", { name: "Agregar un gasto fijo" }).click();
    const select = fixedList(page).getByLabel("Egreso", { exact: true });
    await expect(select).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await select.selectOption({ label: "🍽️ Restaurante con amigos" });
    await fixedList(page).getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(toast(page, "Se agregó “Restaurante con amigos” a los gastos fijos")).toHaveAttribute("data-tone", "success");
    await expect(fixedList(page).getByRole("listitem").filter({ hasText: "Restaurante con amigos" })).toContainText("Agregado por ti");
    await closeToasts(page);
    await openTab(page, "Reportes");
    await expect(biggest(page)).toContainText("Todos los egresos del período son gastos fijos.");
  });

  await test.step("sacarlo: vuelve a ser un gasto más (sin pasar por Quitados)", async () => {
    await openTab(page, "Fijos");
    await fixedList(page).getByRole("button", { name: "Quitar Restaurante con amigos de los gastos fijos" }).click();
    await expect(toast(page, "Se quitó “Restaurante con amigos” de los gastos fijos")).toBeVisible();
    await expect(fixedList(page).getByRole("listitem")).toHaveCount(1);
    await expect(fixedList(page).getByText(/^Quitados/)).toHaveCount(0);
    await closeToasts(page);
    await openTab(page, "Reportes");
    await expect(biggest(page)).toContainText("Restaurante con amigos");
  });
});

test("el historial de un gasto fijo: cada cambio de valor, con su nota", async ({ page }) => {
  const today = todayInTimezone("America/Bogota");
  const date = formatShortDate(today, { withYear: true });
  await register(page);
  await openTab(page, "Egresos");
  for (const month of [m2, m1]) {
    await addExpense(page, { amount: "250000", description: "Plan del celular", category: "Servicios", date: dayOf(month, 8) }, month);
  }
  await addExpense(page, { amount: "270000", description: "Plan del celular", category: "Servicios" });
  await openTab(page, "Fijos");
  const fixed = fixedList(page);
  const history = fixed.getByRole("button", { name: /^Historial de Plan del celular/ });

  await test.step("cerrado dice su último cambio; al tocarlo, el cambio y el primer pago", async () => {
    await expect(history).toHaveAttribute("aria-expanded", "false");
    await expect(history).toContainText(`8 % desde ${formatMonthName(current)}`);
    await history.click();
    await expect(history).toHaveAttribute("aria-expanded", "true");
    const entries = fixed.locator(`[id="${await history.getAttribute("aria-controls")}"]`).getByRole("listitem");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText(`${date}+$20.000,00 (+8 %)$250.000,00 → $270.000,00`);
    await expect(entries.nth(1)).toContainText(`${formatShortDate(dayOf(m2, 8), { withYear: true })}Primer pago$250.000,00`);
  });

  await test.step("agregarle una nota", async () => {
    await fixed.getByRole("button", { name: `Agregar nota del cambio del ${date}` }).click();
    const field = fixed.getByLabel(`Nota del cambio del ${date}`);
    await expect(field).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await field.fill("Subió la tarifa del plan");
    await fixed.getByRole("button", { name: "Guardar nota" }).click();
    await expect(toast(page, "Se guardó la nota")).toHaveAttribute("data-tone", "success");
    await expect(fixed.getByText("“Subió la tarifa del plan”")).toBeVisible();
    // Sin el aviso: mientras aparece (con su animación), axe lo mide a medio camino. Su contraste lo
    // revisa src/color-contrast.test.ts.
    await closeToasts(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("se queda al volver; editarla y borrarla", async () => {
    await page.reload();
    await history.click();
    await expect(fixed.getByText("“Subió la tarifa del plan”")).toBeVisible();
    await fixed.getByRole("button", { name: `Editar nota del cambio del ${date}` }).click();
    const field = fixed.getByLabel(`Nota del cambio del ${date}`);
    await expect(field).toHaveValue("Subió la tarifa del plan");
    await field.fill("Subió la tarifa: pasé al plan con más datos");
    await fixed.getByRole("button", { name: "Guardar nota" }).click();
    await expect(toast(page, "Se guardó la nota")).toBeVisible();
    await expect(fixed.getByText("“Subió la tarifa: pasé al plan con más datos”")).toBeVisible();
    await closeToasts(page);

    await fixed.getByRole("button", { name: `Editar nota del cambio del ${date}` }).click();
    await fixed.getByRole("button", { name: "Eliminar nota" }).click();
    await expect(toast(page, "Se borró la nota")).toHaveAttribute("data-tone", "removal");
    await expect(fixed.getByText(/^“/)).toHaveCount(0);
    await expect(fixed.getByRole("button", { name: `Agregar nota del cambio del ${date}` })).toBeVisible();
  });
});

test("Fijos sin movimientos lo explica", async ({ page }) => {
  await register(page);
  await openTab(page, "Fijos");
  await expect(fixedList(page)).toContainText("Todavía no hay egresos que se repitan cada mes.");
  await expect(fixedList(page).getByRole("button", { name: "Agregar un gasto fijo" })).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Fijos con un gasto fijo y su historial abierto, sin problemas de accesibilidad en modo ${colorScheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await register(page);
    await openTab(page, "Egresos");
    for (const month of [m2, m1]) {
      await addExpense(page, { amount: "250000", description: "Plan del celular", category: "Servicios", date: dayOf(month, 8) }, month);
    }
    await addExpense(page, { amount: "260000", description: "Plan del celular", category: "Servicios" });
    await addExpense(page, { amount: "45000", description: "Cine", category: "Entretenimiento" });
    await openTab(page, "Fijos");
    await expect(fixedList(page).getByRole("listitem")).toHaveCount(1);
    await visible(page.getByRole("button", { name: /^Historial de Plan del celular/ })).click();
    expect(await seriousViolations(page)).toEqual([]);
  });
}
