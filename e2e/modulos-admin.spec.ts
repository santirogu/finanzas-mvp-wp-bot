import { expect, type Page } from "@playwright/test";
import { adminTab, heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { E2E_CRON_SECRET } from "./fake-config";
import { register, test, visible } from "./helpers";

// La sección de administración organizada en módulos: Inicio con una tarjeta por módulo, la
// subnavegación con chips y las rutas viejas, que siguen funcionando.

const subnav = (page: Page) => visible(page.getByRole("navigation", { name: "Secciones de administración" }));
const chip = (page: Page, name: string) => subnav(page).getByRole("link", { name, exact: true });
const cards = (page: Page) => visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem");

test("Inicio muestra una tarjeta por módulo, con su resumen @principal", async ({ page, request }) => {
  // Una corrida reciente de la limpieza diaria: así Salud del sistema está en orden aunque el build sea viejo.
  expect((await request.get("/api/cron/limpieza", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).status()).toBe(200);
  await newAdmin(page);
  await setUpTwoFactor(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(heading(page, "Administración")).toBeVisible();
  await expect(chip(page, "Inicio")).toHaveAttribute("aria-current", "page");

  await expect(cards(page)).toHaveCount(7);
  const history = cards(page).filter({ hasText: "Historial" });
  await expect(history.getByRole("link")).toHaveAttribute("href", "/admin/historial");
  await expect(history).toContainText(/\d+ eventos? hoy · \d+ intentos? fallidos?/);
  const users = cards(page).filter({ hasText: "Usuarios" });
  await expect(users.getByRole("link")).toHaveAttribute("href", "/admin/usuarios");
  await expect(users).toContainText(/\d+ cuentas? · \d+ con WhatsApp/);
  const categories = cards(page).filter({ hasText: "Categorías" });
  await expect(categories.getByRole("link")).toHaveAttribute("href", "/admin/categorias");
  await expect(categories).toContainText(/\d+ de egresos · \d+ de ingresos/);
  const bot = cards(page).filter({ hasText: "Bot de WhatsApp" });
  await expect(bot.getByRole("link")).toHaveAttribute("href", "/admin/bot");
  await expect(bot).toContainText(/\d+ mensajes? hoy · \d+ error(es)?/);
  const security = cards(page).filter({ hasText: "Seguridad" });
  await expect(security.getByRole("link")).toHaveAttribute("href", "/admin/seguridad");
  await expect(security).toContainText("Verificación en dos pasos activa");
  const health = cards(page).filter({ hasText: "Salud del sistema" });
  await expect(health.getByRole("link")).toHaveAttribute("href", "/admin/salud");
  await expect(health).toContainText("Todo en orden");
  // Las E2E que cambian la configuración de la app van aparte (e2e/configuracion-*.spec.ts) y la dejan abierta.
  const settings = cards(page).filter({ hasText: "Configuración" });
  await expect(settings.getByRole("link")).toHaveAttribute("href", "/admin/configuracion");
  await expect(settings).toContainText("Los registros, el aviso para todos y los valores");
  await expect(settings).toContainText("Registros abiertos");
  expect(await seriousViolations(page)).toEqual([]);
});

test("la subnavegación lleva a cada módulo y marca dónde se está; la pestaña Admin sigue marcada", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);

  await expect(subnav(page).getByRole("link")).toHaveText([
    "Inicio",
    "Historial",
    "Usuarios",
    "Bot de WhatsApp",
    "Categorías",
    "Salud del sistema",
    "Configuración",
    "Seguridad",
  ]);
  for (const [name, url] of [
    ["Historial", /\/admin\/historial$/],
    ["Usuarios", /\/admin\/usuarios$/],
    ["Bot de WhatsApp", /\/admin\/bot$/],
    ["Categorías", /\/admin\/categorias$/],
    ["Salud del sistema", /\/admin\/salud$/],
    ["Configuración", /\/admin\/configuracion$/],
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
  for (const path of ["/admin", "/admin/historial", "/admin/usuarios", "/admin/usuarios/cualquiera", "/admin/categorias", "/admin/salud", "/admin/configuracion"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/seguridad$/);
  }
});

test("a un usuario normal no le llega nada de la administración: ni el marco ni los nombres de los módulos", async ({ page }) => {
  await register(page);
  for (const path of ["/admin", "/admin/historial", "/admin/usuarios", "/admin/categorias", "/admin/salud", "/admin/configuracion", "/admin/seguridad"]) {
    const response = await page.goto(path);
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" })), path).toBeVisible();
    // Tampoco en el título de la pestaña (Next lo arma aparte del marco).
    await expect(page, path).not.toHaveTitle(/Administración/);
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
