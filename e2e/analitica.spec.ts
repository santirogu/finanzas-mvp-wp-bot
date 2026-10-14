import { expect } from "@playwright/test";
import { test, visible } from "./helpers";

// Vercel Web Analytics: el script se sirve desde la propia app (la CSP lo permite con 'self') y
// la política de privacidad lo explica. En este build local la ruta de Vercel no existe (404),
// pero no debe terminar en el login.
test("las páginas cargan el script de Vercel Web Analytics desde la propia app", async ({ page }) => {
  await page.goto("/login");
  const script = page.locator('script[src$="/insights/script.js"]');
  await expect(script).toHaveCount(1);
  expect(await script.getAttribute("src")).toMatch(/^\/[^/]/); // misma app, no otro dominio
});

test("las rutas de Vercel no pasan por el proxy (no redirigen al login)", async ({ request }) => {
  const response = await request.get("/_vercel/insights/script.js", { maxRedirects: 0 });
  expect(response.status()).not.toBe(307);
});

test("la política de privacidad explica la analítica anónima", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(visible(page.getByText(/Vercel Web Analytics/))).toBeVisible();
  await expect(visible(page.getByText(/No usa cookies, no guarda tu dirección IP/))).toBeVisible();
});
