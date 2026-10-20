import { expect } from "@playwright/test";
import { register, test, visible } from "./helpers";

// La 404 propia (src/app/[lang]/not-found.tsx) en lugar de la de Next en inglés.
const heading = { name: "No encontramos esta página" } as const;

test("con sesión, una dirección que no existe muestra la 404 en español y vuelve al dashboard", async ({ page }) => {
  await register(page);
  const response = await page.goto("/esta-pagina-no-existe");

  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Página no encontrada · Finanzas");
  await expect(visible(page.getByRole("heading", heading))).toBeVisible();
  await expect(page.getByText(/could not be found/i)).toHaveCount(0);

  await visible(page.getByRole("link", { name: "Volver al inicio" })).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sin sesión, una ruta de API que no existe también la muestra y vuelve a la portada", async ({ page }) => {
  // Las páginas sin sesión redirigen al login (src/proxy.ts); la API no pasa por el proxy.
  const response = await page.goto("/api/no-existe");

  expect(response?.status()).toBe(404);
  await expect(visible(page.getByRole("heading", heading))).toBeVisible();

  await visible(page.getByRole("link", { name: "Volver al inicio" })).click();
  await expect(page).toHaveURL(/\/$/);
});
