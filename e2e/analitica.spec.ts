import { expect } from "@playwright/test";
import { test, visible } from "./helpers";

// Vercel Web Analytics y Speed Insights: sus scripts se sirven desde la propia app (la CSP los
// permite con 'self') y la política de privacidad los explica. En este build local la ruta de Vercel no existe (404),
// pero no debe terminar en el login.
test("las páginas cargan el script de Vercel Web Analytics desde la propia app", async ({ page }) => {
  await page.goto("/login");
  const script = page.locator('script[src$="/insights/script.js"]');
  await expect(script).toHaveCount(1);
  expect(await script.getAttribute("src")).toMatch(/^\/[^/]/); // misma app, no otro dominio
});

test("las páginas cargan el script de Vercel Speed Insights desde la propia app", async ({ page }) => {
  await page.goto("/login");
  const script = page.locator('script[src$="/speed-insights/script.js"]');
  await expect(script).toHaveCount(1);
  expect(await script.getAttribute("src")).toMatch(/^\/[^/]/);
});

test("las rutas de Vercel no pasan por el proxy (no redirigen al login)", async ({ request }) => {
  for (const path of ["/_vercel/insights/script.js", "/_vercel/speed-insights/script.js"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).not.toBe(307);
  }
});

test("la política de privacidad explica la analítica y la medición de velocidad", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(visible(page.getByText(/Vercel Web Analytics/))).toBeVisible();
  await expect(visible(page.getByText(/No usa cookies, no guarda tu dirección IP/))).toBeVisible();
  await expect(visible(page.getByText(/Vercel Speed Insights/))).toBeVisible();
});
