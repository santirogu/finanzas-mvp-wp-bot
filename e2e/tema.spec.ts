import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { logIn, logOut, register, test, visible } from "./helpers";

// La apariencia se elige en Configuración: Sistema (por defecto), Claro u Oscuro. Se guarda en el navegador y en
// la cuenta, y se aplica en todas las páginas, también sin sesión (el login) y en otro navegador al entrar.

const LIGHT = "rgb(246, 247, 249)"; // --background claro
const DARK = "rgb(13, 16, 20)"; // --background oscuro
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const picker = (page: Page) => visible(page.getByRole("group", { name: "Apariencia" }));

test("elegir claro u oscuro en Configuración, o seguir el del sistema @principal", async ({ page }) => {
  test.slow();
  await page.emulateMedia({ colorScheme: "light" });
  const { email } = await register(page);
  await page.goto("/configuracion");
  await expect(picker(page).getByRole("radio", { name: "Sistema" })).toBeChecked();
  expect(await background(page)).toBe(LIGHT);

  await test.step("Oscuro, aunque el sistema esté en claro", async () => {
    await picker(page).getByText("Oscuro").click();
    await expect.poll(() => background(page)).toBe(DARK);
    await expect(picker(page).getByRole("radio", { name: "Oscuro" })).toBeChecked();
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("se recuerda: al recargar, en otras páginas y sin sesión", async () => {
    await page.reload();
    expect(await background(page)).toBe(DARK);
    await page.goto("/egresos");
    expect(await background(page)).toBe(DARK);
    await logOut(page);
    expect(await background(page)).toBe(DARK);
  });

  await test.step("Claro, aunque el sistema esté en oscuro", async () => {
    await page.emulateMedia({ colorScheme: "dark" });
    await logIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/configuracion");
    await picker(page).getByText("Claro").click();
    await expect.poll(() => background(page)).toBe(LIGHT);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("Sistema vuelve a seguir el del sistema", async () => {
    await picker(page).getByText("Sistema").click();
    await expect.poll(() => background(page)).toBe(DARK);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => background(page)).toBe(LIGHT);
  });
});

test("la apariencia viaja con la cuenta: otro navegador la recibe al iniciar sesión @principal", async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const { email } = await register(page);
  await page.goto("/configuracion");
  await picker(page).getByText("Oscuro").click();
  await expect.poll(() => background(page)).toBe(DARK);
  // Se guarda en la cuenta sin esperar: que termine antes de entrar desde el otro navegador.
  await page.waitForLoadState("networkidle");

  const other = await browser.newContext({ colorScheme: "light" });
  const otherPage = await other.newPage();
  await otherPage.goto("/login");
  expect(await background(otherPage)).toBe(LIGHT);
  await logIn(otherPage, email);
  await expect(otherPage).toHaveURL(/\/dashboard$/);
  expect(await background(otherPage)).toBe(DARK);
  await otherPage.goto("/configuracion");
  await expect(picker(otherPage).getByRole("radio", { name: "Oscuro" })).toBeChecked();
  // Queda en ese navegador también sin sesión.
  await logOut(otherPage);
  expect(await background(otherPage)).toBe(DARK);
  await other.close();
});
