import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { register, test, visible } from "./helpers";

// El inglés, con la cookie `idioma=en` (todavía no se elige desde la app): lo que ya está traducido —las
// páginas públicas, la navegación, el menú de la cuenta, el selector de meses y la 404—, con la misma
// dirección de siempre y el <html lang="en">.

const inEnglish = (page: Page) => page.context().addCookies([{ name: "idioma", value: "en", domain: "localhost", path: "/" }]);

const seriousViolations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);

test("sin sesión: la portada, el login y el registro en inglés, con sus mensajes @principal", async ({ page }) => {
  await inEnglish(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Your finances, as easy as sending a WhatsApp." }))).toBeVisible();

  await visible(page.getByRole("link", { name: "Sign in" })).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("Sign in · Finanzas");
  await visible(page.getByRole("button", { name: "Sign in" })).click();
  await expect(visible(page.getByText("Enter your email."))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await visible(page.getByRole("link", { name: "Sign up" })).click();
  await expect(page).toHaveURL(/\/registro$/);
  await expect(visible(page.getByRole("heading", { name: "Create your account" }))).toBeVisible();
  await expect(visible(page.getByLabel("Name"))).toBeVisible();
});

test("con sesión: la navegación, el menú de la cuenta, el selector de meses y la 404 en inglés @principal", async ({ page }) => {
  await register(page);
  await inEnglish(page);
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const tabs = visible(page.getByRole("navigation")).first();
  for (const name of ["Overview", "Income", "Expenses", "Bills", "Reports"]) await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(visible(page.getByRole("link", { name: /^Previous month: / }))).toBeVisible();

  await visible(page.getByRole("button", { name: /^Your account: / })).click();
  await expect(visible(page.getByRole("link", { name: "My account" }))).toBeVisible();
  await expect(visible(page.getByRole("link", { name: "Help" }))).toBeVisible();
  await expect(visible(page.getByRole("button", { name: "Sign out" }))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // Pasar de pestaña sigue con la dirección de siempre (sin /en).
  await page.keyboard.press("Escape");
  await tabs.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(page).toHaveURL(/\/egresos$/);
  await expect(tabs.getByRole("link", { name: "Expenses", exact: true })).toHaveAttribute("aria-current", "page");

  const response = await page.goto("/esta-pagina-no-existe");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found · Finanzas");
  await expect(visible(page.getByRole("heading", { name: "We couldn't find this page" }))).toBeVisible();
});

test("en inglés, las cinco pestañas también caben en 375 px sin deslizar la franja @tactil", async ({ page }) => {
  await register(page);
  await inEnglish(page);
  await page.goto("/dashboard");
  const nav = visible(page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Bills", exact: true }) }));
  for (const width of [375, 393]) {
    await page.setViewportSize({ width, height: 700 });
    // Lo que sobra al lado de las pestañas (en el Mac, unos 30 px en 375): en Linux (el CI), la letra sale
    // unos 15 px más ancha.
    const margin = await nav.evaluate((el) => el.clientWidth - [...el.children].reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0));
    expect(margin, `${width} px`).toBeGreaterThanOrEqual(0);
  }
});
