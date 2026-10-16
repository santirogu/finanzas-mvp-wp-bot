import { expect, type Page } from "@playwright/test";
import { addTransaction, newPerson, openTab, register, test, visible } from "./helpers";

const row = (page: Page, description: string) =>
  visible(page.getByRole("listitem").filter({ hasText: description }));

/** Abre la edición de un movimiento de la lista y espera a que cargue su página. */
async function openEdit(page: Page, description: string) {
  await visible(page.getByRole("link", { name: `Editar ${description}` })).click();
  await expect(page).toHaveURL(/\/movimientos\/[0-9a-f-]{36}\/editar$/);
  await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
}

async function chooseCategory(page: Page, name: string) {
  const select = visible(page.getByLabel("Categoría"));
  const value = await select.locator("option", { hasText: name }).getAttribute("value");
  await select.selectOption(value ?? "");
}

test("corregir un egreso: monto, descripción y categoría @principal", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "500000", description: "Zapatos", category: "Ropa" });
  await expect(row(page, "Zapatos")).toContainText(/−\$500\.000,00/);

  await test.step("abrir el movimiento muestra sus datos", async () => {
    await openEdit(page, "Zapatos");
    await expect(visible(page.getByLabel("Monto"))).toHaveValue("500.000");
    await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Zapatos");
    await expect(visible(page.getByLabel("Categoría")).locator("option:checked")).toHaveText(/Ropa/);
  });

  await test.step("guardar los cambios vuelve a la lista con el movimiento corregido", async () => {
    await visible(page.getByLabel("Monto")).fill("450000");
    await visible(page.getByLabel("Descripción")).fill("Zapatos rebajados");
    await chooseCategory(page, "Mercado");
    await visible(page.getByRole("button", { name: "Guardar cambios" })).click();

    await expect(page).toHaveURL(/\/egresos$/);
    const edited = row(page, "Zapatos rebajados");
    await expect(edited).toContainText(/−\$450\.000,00/);
    await expect(edited).toContainText("Mercado");
    await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();
  });

  await test.step("el resumen refleja el monto nuevo", async () => {
    await openTab(page, "Resumen");
    await expect(visible(page.getByText("Balance del mes")).locator("..")).toContainText(/−\$450\.000,00/);
  });
});

test("los centavos se escriben después de la coma y se corrigen como el resto del monto", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  const amount = visible(page.getByLabel("Monto"));

  await test.step("se escriben con coma (o con punto, si el teclado no tiene coma)", async () => {
    // Tecla por tecla, como una persona: el campo pone los puntos de miles y la coma.
    await amount.pressSequentially("25900,505");
    await expect(amount).toHaveValue("25.900,50");
    await amount.clear();
    await amount.pressSequentially("25900.5");
    await expect(amount).toHaveValue("25.900,5");
    await visible(page.getByLabel("Descripción")).fill("Almuerzo");
    await visible(page.getByRole("button", { name: "Registrar egreso" })).click();

    await expect(row(page, "Almuerzo")).toContainText(/−\$25\.900,50/);
    await expect(visible(page.getByText("$25.900,50", { exact: true }))).toBeVisible();
  });

  await test.step("al editar, el monto trae sus centavos", async () => {
    await openEdit(page, "Almuerzo");
    await expect(visible(page.getByLabel("Monto"))).toHaveValue("25.900,50");
    await visible(page.getByLabel("Monto")).fill("25.900,75");
    await visible(page.getByRole("button", { name: "Guardar cambios" })).click();

    await expect(page).toHaveURL(/\/egresos$/);
    await expect(row(page, "Almuerzo")).toContainText(/−\$25\.900,75/);
    await openTab(page, "Resumen");
    await expect(visible(page.getByText("Balance del mes")).locator("..")).toContainText(/−\$25\.900,75/);
  });
});

test("cancelar no cambia nada y un error no pierde lo escrito", async ({ page }) => {
  await register(page);
  await openTab(page, "Ingresos");
  await addTransaction(page, { amount: "2000000", description: "Sueldo", category: "Salario" });
  await expect(row(page, "Sueldo")).toBeVisible();

  await openEdit(page, "Sueldo");
  await visible(page.getByLabel("Monto")).fill("0");
  await visible(page.getByLabel("Descripción")).fill("Sueldo corregido");
  await visible(page.getByRole("button", { name: "Guardar cambios" })).click();
  await expect(visible(page.getByText("Ingresa un monto mayor que cero"))).toBeVisible();
  await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Sueldo corregido");

  await visible(page.getByRole("link", { name: "Cancelar" })).click();
  await expect(page).toHaveURL(/\/ingresos$/);
  await expect(row(page, "Sueldo")).toContainText(/\+\$2\.000\.000,00/);
  await expect(visible(page.getByText("Sueldo corregido"))).toHaveCount(0);
});

test("nadie puede abrir la edición de un movimiento ajeno", async ({ browser }) => {
  const ana = await newPerson(browser);
  await register(ana, "Ana");
  await openTab(ana, "Egresos");
  await addTransaction(ana, { amount: "750000", description: "Secreto de Ana" });
  await expect(row(ana, "Secreto de Ana")).toBeVisible();
  await openEdit(ana, "Secreto de Ana");
  const editUrl = ana.url();

  const beto = await newPerson(browser);
  await register(beto, "Beto");
  await beto.goto(editUrl);
  await expect(visible(beto.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
  await expect(beto.getByText("Secreto de Ana")).toHaveCount(0);
  await expect(beto.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
});
