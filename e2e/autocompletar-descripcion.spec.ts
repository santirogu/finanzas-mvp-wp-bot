import { expect, type Page } from "@playwright/test";
import { addTransaction, newPerson, openTab, register, test, toast, visible } from "./helpers";

// Al escribir la descripción de un movimiento nuevo, el navegador sugiere las que la persona ya usó en
// ese tipo (las de los últimos meses), y elegir una propone la categoría de la última vez.

const form = (page: Page) => visible(page.locator("form").filter({ has: page.getByRole("heading", { name: /^Nuevo/ }) }));
const description = (page: Page) => form(page).getByLabel("Descripción");
/** Las sugerencias que ofrece el campo (las opciones de su <datalist>). */
async function suggestions(page: Page) {
  const list = await description(page).getAttribute("list");
  return list ? page.locator(`datalist[id="${list}"] option`).evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value)) : [];
}

test("la descripción sugiere lo que ya registró y propone su categoría", async ({ page, browser }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "85000", description: "Mercado del barrio", category: "Mercado" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
  await addTransaction(page, { amount: "12000", description: "Tinto" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();

  await test.step("las sugiere, y la de la última vez trae su categoría", async () => {
    await expect.poll(() => suggestions(page)).toEqual(["Mercado del barrio", "Tinto"]);
    await description(page).fill("mercado del barrio");
    await expect(form(page).getByLabel("Categoría").locator("option:checked")).toHaveText(/Mercado/);
  });

  await test.step("en Ingresos no sugiere los egresos", async () => {
    await openTab(page, "Ingresos");
    expect(await suggestions(page)).toEqual([]);
  });

  await test.step("otra persona no ve lo que escribió Ana", async () => {
    const beto = await newPerson(browser);
    await register(beto, "Beto");
    await openTab(beto, "Egresos");
    expect(await suggestions(beto)).toEqual([]);
  });
});
