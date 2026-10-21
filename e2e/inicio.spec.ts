import { expect } from "@playwright/test";
import { seriousViolations } from "./admin";
import { test, visible } from "./helpers";

// La página de inicio y la marca (Anotado): el eslogan, la conversación de ejemplo con el bot, lo que
// hace la app, y los íconos, el manifest y la imagen para compartir el enlace.

test("la portada: qué es Anotado, un ejemplo con el bot y para qué sirve @principal", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Anotado");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Escribe tu gasto por WhatsApp. Queda anotado." }))).toBeVisible();

  const example = visible(page.getByRole("figure", { name: /Una conversación de ejemplo con el bot/ }));
  await expect(example.getByRole("listitem")).toHaveText([
    "gasté 25 mil en almuerzo",
    /✅ Egreso Anotado: Almuerzo — \$25\.000,00 \(Alimentación\)/,
    "y 12 mil de taxi",
    /✅ Egreso Anotado: Taxi — \$12\.000,00 \(Transporte\)\s*Balance del mes: \$1\.284\.500,00/,
  ]);
  await expect(page.getByRole("region", { name: "Qué hace Anotado" }).getByRole("heading", { level: 3 })).toHaveText([
    "Por WhatsApp",
    "Tu mes en claro",
    "Tus datos son tuyos",
  ]);
  expect(await seriousViolations(page)).toEqual([]);

  await visible(page.getByRole("link", { name: "Crear cuenta" })).click();
  await expect(page).toHaveURL(/\/registro$/);
  // El logo de arriba lleva de vuelta al inicio.
  await visible(page.getByRole("link", { name: "Anotado" })).click();
  await expect(page).toHaveURL(/\/$/);
  await visible(page.getByRole("link", { name: "Iniciar sesión" })).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("los íconos, el manifest y la imagen para compartir: enlazados y servidos (sin pasar por el idioma)", async ({ page, request }) => {
  await page.goto("/");
  const head = page.locator("head");
  await expect(head.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", /^\/icon\.svg/);
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /^\/apple-icon\.png/);
  await expect(head.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(head.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image\.png$/);
  await expect(head.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Anotado");

  for (const [url, type] of [
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
    ["/favicon.ico", "image/x-icon"],
    ["/opengraph-image.png", "image/png"],
    ["/marca/icono-512.png", "image/png"],
  ]) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()["content-type"], url).toContain(type);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Anotado", short_name: "Anotado", start_url: "/dashboard" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
});
