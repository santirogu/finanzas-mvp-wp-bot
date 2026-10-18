import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { addTransaction, newPerson, openTab, register, test, visible } from "./helpers";

// Al escribir la descripción de un movimiento nuevo, debajo del campo aparecen las que la persona ya
// usó en ese tipo (las de los últimos meses), y elegir una propone la categoría de la última vez.

const form = (page: Page) => visible(page.locator("form").filter({ has: page.getByRole("heading", { name: /^Nuevo/ }) }));
const description = (page: Page) => form(page).getByRole("combobox", { name: "Descripción" });
const suggestionList = (page: Page) => page.getByRole("listbox", { name: "Descripciones que ya usaste" });

test("la descripción sugiere lo que ya registró y propone su categoría @principal", async ({ page, browser }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "85000", description: "Mercado del barrio", category: "Mercado" });
  await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();
  await addTransaction(page, { amount: "12000", description: "Tinto" });
  // El aviso del primero puede seguir a la vista: se espera a que esté el segundo en la lista.
  await expect(visible(page.getByText("2 movimientos este mes"))).toBeVisible();

  await test.step("al escribir, las muestra con su categoría; al tocar una, la elige con su categoría", async () => {
    await description(page).fill("");
    await description(page).pressSequentially("merc");
    await expect(suggestionList(page).getByRole("option")).toHaveText([/Mercado del barrio\s*🛒 Mercado/]);
    expect(await seriousViolations(page)).toEqual([]);
    await suggestionList(page).getByRole("option", { name: /Mercado del barrio/ }).click();
    await expect(description(page)).toHaveValue("Mercado del barrio");
    await expect(form(page).getByLabel("Categoría").locator("option:checked")).toHaveText(/Mercado/);
    await expect(suggestionList(page)).toBeHidden();
  });

  await test.step("con el teclado: flecha abajo y Enter (sin registrar)", async () => {
    await description(page).fill("");
    await description(page).pressSequentially("tin");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(description(page)).toHaveValue("Tinto");
    await expect(suggestionList(page)).toBeHidden();
    // Enter eligió la sugerencia, no envió el formulario: siguen siendo dos.
    await expect(visible(page.getByText("2 movimientos este mes"))).toBeVisible();
  });

  await test.step("en Ingresos no sugiere los egresos", async () => {
    await openTab(page, "Ingresos");
    await form(page).getByLabel("Descripción").pressSequentially("merc");
    await expect(suggestionList(page)).toHaveCount(0);
  });

  await test.step("otra persona no ve lo que escribió Ana", async () => {
    const beto = await newPerson(browser);
    await register(beto, "Beto");
    await openTab(beto, "Egresos");
    await form(beto).getByLabel("Descripción").pressSequentially("merc");
    await expect(suggestionList(beto)).toHaveCount(0);
  });
});
