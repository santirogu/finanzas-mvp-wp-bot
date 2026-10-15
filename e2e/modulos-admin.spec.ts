import { expect, type Page } from "@playwright/test";
import { adminTab, heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { register, test, visible } from "./helpers";

// La sección de administración organizada en módulos: Inicio con una tarjeta por módulo, la
// subnavegación con chips y las rutas viejas, que siguen funcionando.

const subnav = (page: Page) => visible(page.getByRole("navigation", { name: "Secciones de administración" }));
const chip = (page: Page, name: string) => subnav(page).getByRole("link", { name, exact: true });
const cards = (page: Page) => visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem");

test("Inicio muestra una tarjeta por módulo: los activos con su resumen y los que vienen como 'Pronto' @principal", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(heading(page, "Administración")).toBeVisible();
  await expect(chip(page, "Inicio")).toHaveAttribute("aria-current", "page");

  await expect(cards(page)).toHaveCount(7);
  const history = cards(page).filter({ hasText: "Historial" });
  await expect(history.getByRole("link")).toHaveAttribute("href", "/admin/historial");
  await expect(history).toContainText(/\d+ eventos? hoy · \d+ intentos? fallidos?/);
  const security = cards(page).filter({ hasText: "Seguridad" });
  await expect(security.getByRole("link")).toHaveAttribute("href", "/admin/seguridad");
  await expect(security).toContainText("Verificación en dos pasos activa");
  for (const name of ["Usuarios", "Bot de WhatsApp", "Categorías", "Salud del sistema", "Configuración"]) {
    const card = cards(page).filter({ hasText: name });
    await expect(card, name).toContainText("Pronto");
    await expect(card.getByRole("link"), name).toHaveCount(0);
  }
  expect(await seriousViolations(page)).toEqual([]);
});

test("la subnavegación lleva a cada módulo y marca dónde se está; la pestaña Admin sigue marcada", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);

  await expect(subnav(page).getByRole("link")).toHaveText(["Inicio", "Historial", "Seguridad"]);
  for (const [name, url] of [
    ["Historial", /\/admin\/historial$/],
    ["Seguridad", /\/admin\/seguridad$/],
    ["Inicio", /\/admin$/],
  ] as const) {
    await chip(page, name).click();
    await expect(page).toHaveURL(url);
    await expect(chip(page, name)).toHaveAttribute("aria-current", "page");
    await expect(adminTab(page)).toHaveAttribute("aria-current", "page");
  }
  // Desde una tarjeta de Inicio también.
  await cards(page).filter({ hasText: "Historial" }).getByRole("link").click();
  await expect(heading(page, "Registro y vinculación de WhatsApp")).toBeVisible();
});

test("las rutas viejas siguen funcionando", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);

  await page.goto("/admin/verificacion");
  await expect(page).toHaveURL(/\/admin\/seguridad$/);
  await expect(visible(page.getByText("✓ Está activa"))).toBeVisible();

  await page.goto("/admin?tipo=registered&q=nadie-en-esta-prueba&fecha=hoy");
  await expect(page).toHaveURL(/\/admin\/historial\?tipo=registered&q=nadie-en-esta-prueba&fecha=hoy$/);
  await expect(visible(page.getByRole("link", { name: "Quitar filtro: Registros" }))).toBeVisible();
});

test("un admin sin la verificación ve el marco pero solo puede entrar a Seguridad", async ({ page }) => {
  await newAdmin(page);
  await expect(page).toHaveURL(/\/admin\/seguridad$/);
  await expect(chip(page, "Seguridad")).toHaveAttribute("aria-current", "page");
  for (const path of ["/admin", "/admin/historial"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/seguridad$/);
  }
});

test("a un usuario normal no le llega nada de la administración: ni el marco ni los nombres de los módulos", async ({ page }) => {
  await register(page);
  for (const path of ["/admin", "/admin/historial", "/admin/seguridad"]) {
    const response = await page.goto(path);
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" })), path).toBeVisible();
    const html = (await response!.text()) + (await page.content());
    for (const text of ["Secciones de administración", "Salud del sistema", "Solo para administradores"]) {
      expect(html, `${path}: ${text}`).not.toContain(text);
    }
  }
});

test("en celular, la subnavegación se desliza sin mover la página", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  await expect(chip(page, "Inicio")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
});

test("en modo oscuro, Inicio no tiene problemas de accesibilidad", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await newAdmin(page);
  await setUpTwoFactor(page);
  await expect(cards(page)).toHaveCount(7);
  expect(await seriousViolations(page)).toEqual([]);
});
