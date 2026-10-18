import { expect, type Page } from "@playwright/test";
import { addTransaction, openTab, register, test, toast, visible } from "./helpers";

const text = (page: Page, value: string | RegExp) => visible(page.getByText(value));
const balance = (page: Page) => text(page, "Balance del mes").locator("..");
// Las filas de la lista (en la página, no en los avisos emergentes, que también son elementos de lista).
const row = (page: Page, description: string) =>
  visible(page.getByRole("main").getByRole("listitem").filter({ hasText: description }));

// El recorrido que hace cualquier usuario. Corre en escritorio y en celular (@principal).
test("registrarse, llevar ingresos y egresos, ver el balance y salir @principal", async ({ page }) => {
  await register(page, "Ana Pérez");

  await test.step("una cuenta nueva empieza vacía", async () => {
    await expect(text(page, "Hola, Ana")).toBeVisible();
    await expect(balance(page)).toContainText("$0,00");
    await expect(text(page, "Aún no tienes movimientos este mes.")).toBeVisible();
  });

  await test.step("registrar un ingreso", async () => {
    await openTab(page, "Ingresos");
    await addTransaction(page, { amount: "2000000", description: "Pago de nómina", category: "Salario" });
    await expect(toast(page, /^Ingreso registrado$/)).toHaveAttribute("data-tone", "success");
    await expect(row(page, "Pago de nómina")).toContainText("Salario");
    await expect(row(page, "Pago de nómina")).toContainText("+$2.000.000,00");
    await expect(text(page, "1 movimiento este mes")).toBeVisible();
  });

  await test.step("registrar un egreso", async () => {
    await openTab(page, "Egresos");
    await addTransaction(page, { amount: "500000", description: "Zapatos", category: "Ropa" });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
    await expect(row(page, "Zapatos")).toContainText("−$500.000,00");
  });

  await test.step("el resumen muestra el balance del mes", async () => {
    await openTab(page, "Resumen");
    await expect(balance(page)).toContainText("$1.500.000,00");
    await expect(visible(page.getByRole("link", { name: /^Ingresos \$2\.000\.000,00$/ }))).toBeVisible();
    await expect(visible(page.getByRole("link", { name: /^Egresos \$500\.000,00$/ }))).toBeVisible();
    const recent = visible(page.locator("section", { hasText: "Últimos movimientos" }));
    await expect(recent).toContainText("Pago de nómina");
    await expect(recent).toContainText("Zapatos");
    await expect(visible(page.locator("section", { hasText: "Gastos por categoría" }))).toContainText(
      /Ropa\s*\$500\.000,00 · 100%/,
    );
  });

  await test.step("eliminar un egreso recalcula el balance", async () => {
    await openTab(page, "Egresos");
    await visible(page.getByRole("button", { name: "Eliminar Zapatos" })).click();
    await expect(text(page, "No has registrado egresos este mes.")).toBeVisible();
    await openTab(page, "Resumen");
    await expect(balance(page)).toContainText("$2.000.000,00");
  });

  await test.step("salir cierra la sesión", async () => {
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("los errores del formulario se muestran y no se pierde lo escrito", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");

  await addTransaction(page, { amount: "0", description: "Monto inválido", category: "Mercado" });

  await expect(text(page, "Ingresa un monto mayor que cero")).toBeVisible();
  await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Monto inválido");
  const category = visible(page.getByLabel("Categoría"));
  await expect(category.locator("option:checked")).toHaveText(/Mercado/);
  await expect(text(page, "No has registrado egresos este mes.")).toBeVisible();
});
