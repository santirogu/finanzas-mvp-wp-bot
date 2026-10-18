import { expect, type Page } from "@playwright/test";
import { addTransaction, formAlert, goToAccount, openTab, PASSWORD, register, test, toast, uniqueEmail, visible } from "./helpers";

async function openAccount(page: Page) {
  await goToAccount(page);
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(visible(page.getByRole("heading", { name: "Mi cuenta", exact: true }))).toBeVisible();
}

test("eliminar la cuenta borra todo y permite empezar de cero con el mismo correo @principal", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "500000", description: "Zapatos" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();

  await test.step("Mi cuenta muestra los datos y qué se va a borrar", async () => {
    await openAccount(page);
    await expect(visible(page.getByText(email))).toBeVisible();
    await expect(visible(page.getByText(/todos tus ingresos, egresos y categorías/))).toBeVisible();
    await expect(visible(page.getByRole("button", { name: "Eliminar mi cuenta para siempre" }))).toBeDisabled();
  });

  await test.step("con la contraseña equivocada no borra nada", async () => {
    await visible(page.getByLabel("Tu contraseña")).fill("otra-clave-123");
    await visible(page.getByLabel(/Escribe ELIMINAR para confirmar/)).fill("ELIMINAR");
    await visible(page.getByRole("button", { name: "Eliminar mi cuenta para siempre" })).click();
    await expect(visible(page.getByText("Contraseña incorrecta"))).toBeVisible();
    await expect(page).toHaveURL(/\/cuenta$/);
  });

  await test.step("con la contraseña correcta elimina la cuenta y cierra la sesión", async () => {
    await visible(page.getByLabel("Tu contraseña")).fill(PASSWORD);
    await visible(page.getByRole("button", { name: "Eliminar mi cuenta para siempre" })).click();
    await expect(page).toHaveURL(/\/cuenta-eliminada$/);
    await expect(page.getByRole("heading", { name: "Tu cuenta fue eliminada" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("ya no se puede entrar con esa cuenta", async () => {
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(formAlert(page)).toHaveText("Correo o contraseña incorrectos.");
  });

  await test.step("se puede crear una cuenta nueva con el mismo correo, vacía", async () => {
    await register(page, "Ana de nuevo", email);
    await expect(visible(page.getByText("Aún no tienes movimientos este mes."))).toBeVisible();
  });
});
