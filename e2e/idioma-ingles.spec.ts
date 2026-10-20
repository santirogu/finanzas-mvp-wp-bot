import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { totp } from "../test/totp";
import { newAdmin, wrongCode } from "./admin";
import { PASSWORD, addTransaction, newPerson, register, test, toast, uniqueEmail, visible } from "./helpers";

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
  await expect(visible(page.getByRole("link", { name: "My account", exact: true }))).toBeVisible();
  await expect(visible(page.getByRole("link", { name: "Help", exact: true }))).toBeVisible();
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

test("en inglés: registrar un egreso con el formato de EE. UU. y verlo en la lista, el Resumen y Fijos @principal", async ({ page }) => {
  await register(page);
  await inEnglish(page);
  await page.goto("/egresos");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Expenses" }))).toBeVisible();
  await expect(page).toHaveTitle("Expenses · Finanzas");

  const form = visible(page.locator("form").filter({ has: page.getByRole("heading", { name: "New expense" }) }));
  await form.getByLabel(/Amount/).fill("1250.5");
  await expect(form.getByLabel(/Amount/)).toHaveValue("1,250.5");
  await form.getByLabel(/Description/).fill("Lunch");
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(visible(page.getByRole("region", { name: "Notices" }))).toContainText("Expense added");
  const list = visible(page.getByRole("heading", { name: "1 transaction this month" }));
  await expect(list).toBeVisible();
  await expect(visible(page.getByRole("listitem").filter({ hasText: "Lunch" }))).toContainText("−$1,250.50");
  await expect(visible(page.getByRole("listitem").filter({ hasText: "Lunch" }))).toContainText("No category");

  // Borrar y deshacer, en inglés.
  await visible(page.getByRole("button", { name: "Delete Lunch" })).click();
  await expect(visible(page.getByRole("region", { name: "Notices" }))).toContainText("“Lunch” was deleted");
  await visible(page.getByRole("button", { name: "Undo" })).click();
  await expect(visible(page.getByRole("region", { name: "Notices" }))).toContainText("“Lunch” was restored");

  await page.goto("/dashboard");
  await expect(page).toHaveTitle("Overview · Finanzas");
  await expect(visible(page.getByText("Balance for the month"))).toBeVisible();
  await expect(visible(page.getByText("−$1,250.50")).first()).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Latest transactions" }))).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Spending by category" }))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto("/gastos-fijos");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Bills" }))).toBeVisible();
  await expect(visible(page.getByText("There are no expenses that repeat every month yet."))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("en inglés: Reportes, con la descarga del CSV para el Excel en inglés @principal", async ({ page }) => {
  await register(page);
  await page.goto("/egresos");
  await addTransaction(page, { amount: "1.250,50", description: "Almuerzo" });
  // Que se haya guardado antes de salir de la página (si no, la navegación corta la acción).
  await expect(toast(page, "Egreso registrado")).toBeVisible();
  await inEnglish(page);
  await page.goto("/reportes");
  await expect(page).toHaveTitle("Reports · Finanzas");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Reports" }))).toBeVisible();
  await expect(visible(page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Last 12 months" }))).toHaveAttribute("aria-current", "page");
  await expect(visible(page.getByRole("region", { name: "Period summary" }))).toContainText("$1,250.50");
  await expect(visible(page.getByRole("heading", { name: "Spending by category" }))).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Which days do you spend the most?" }))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await visible(page.getByRole("button", { name: "Download" })).click();
  const options = visible(page.getByRole("group", { name: "Download options" }));
  const [download] = await Promise.all([page.waitForEvent("download"), options.getByRole("link", { name: /Transactions \(CSV\)/ }).click()]);
  const current = monthOf(todayInTimezone("America/Bogota"));
  expect(download.suggestedFilename()).toBe(`transactions-${monthParam(shiftMonth(current, -11))}-to-${monthParam(current)}.csv`);
  const lines = readFileSync(await download.path(), "utf8").slice(1).split("\r\n");
  expect(lines[0]).toBe("Date,Type,Description,Category,Amount,Source");
  expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},Expense,Almuerzo,No category,-1250\.50,Web$/);
});

test("en inglés: Mi cuenta, la Ayuda y las páginas legales (solo en español, con su nota) @principal", async ({ page }) => {
  await register(page);
  await inEnglish(page);

  await page.goto("/cuenta");
  await expect(page).toHaveTitle("My account · Finanzas");
  await expect(visible(page.getByRole("heading", { level: 1, name: "My account" }))).toBeVisible();
  await expect(visible(page.getByRole("region", { name: "Your details" }))).toContainText("User");
  await expect(visible(page.getByRole("region", { name: "Security" }))).toBeVisible();
  await expect(visible(page.getByRole("region", { name: "Notifications" }))).toBeVisible();
  await expect(visible(page.getByLabel("Type DELETE to confirm"))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto("/ayuda");
  await expect(page).toHaveTitle("Help · Finanzas");
  const topics = visible(page.getByRole("region", { name: "Help topics" }));
  await topics.locator("summary", { hasText: "The WhatsApp bot" }).click();
  await expect(topics).toContainText("For now the bot answers in Spanish.");
  const closed = topics.locator("details:not([open])");
  while ((await closed.count()) > 0) await closed.first().locator("summary").click();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto("/privacidad");
  await expect(visible(page.getByText("This page is only available in Spanish."))).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("lang", "es");
  await expect(page.getByText("This page is only available in Spanish.")).toHaveAttribute("lang", "en");
  expect(await seriousViolations(page)).toEqual([]);
});

test("en inglés: la administración (Seguridad, el inicio, Usuarios y una acción con su código) @principal", async ({ page, browser }) => {
  const beto = await newPerson(browser);
  const betoEmail = uniqueEmail();
  await register(beto, "Beto Inglés", betoEmail);

  await newAdmin(page);
  await inEnglish(page);
  const heading = (name: string | RegExp) => visible(page.getByRole("heading", { name }));
  const field = (label: string) => visible(page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]"));
  let secret = "";

  await test.step("Seguridad: los tres pasos de la verificación", async () => {
    await page.goto("/admin/seguridad");
    await expect(page).toHaveTitle("Security · Administration · Finanzas");
    await expect(heading("Two-step verification")).toBeVisible();
    await page.getByLabel("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading("Step 2 of 3: scan the code")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    secret = (await page.getByLabel("Setup key").textContent())!.replace(/\s/g, "");
    await page.getByLabel("6-digit code").fill(totp(secret));
    await page.getByRole("button", { name: "Turn on verification" }).click();
    await expect(heading("Step 3 of 3: save your backup codes")).toBeVisible();
    await page.getByLabel("I saved my backup codes").check();
    await page.getByRole("button", { name: "Go to Administration" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  await test.step("el inicio y la subnavegación", async () => {
    await expect(page).toHaveTitle("Administration · Finanzas");
    await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    const nav = visible(page.getByRole("navigation", { name: "Administration sections" }));
    await expect(nav.getByRole("link")).toHaveText(["Home", "History", "Users", "WhatsApp bot", "Categories", "Security"]);
    await expect(visible(page.getByText("Two-step verification on"))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await nav.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
  });

  await test.step("Usuarios: la búsqueda, los filtros y la cuenta", async () => {
    await expect(page).toHaveTitle("Users · Administration · Finanzas");
    await expect(heading("Accounts")).toBeVisible();
    const search = visible(page.getByRole("searchbox", { name: "Search" }));
    await search.fill(betoEmail);
    await search.press("Enter");
    await expect(visible(page.getByText("1 account", { exact: true }))).toBeVisible();
    await expect(visible(page.getByRole("list", { name: "Active filters" }))).toContainText(betoEmail);
    const account = visible(page.getByRole("list", { name: "Accounts" })).getByRole("listitem").first();
    await expect(account).toContainText("Beto Inglés");
    await expect(account).toContainText(/No WhatsApp · Signed up: [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    const filters = visible(page.getByRole("button", { name: "Filters (active: 1)" }));
    await filters.click();
    await expect(visible(page.getByRole("group", { name: "Status" }))).toContainText("Sign-in locked");
    expect(await seriousViolations(page)).toEqual([]);
    // En el celular, el panel abierto queda encima de la lista.
    await filters.click();
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await account.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
  });

  await test.step("el detalle y cerrar sus sesiones con el código (primero uno equivocado)", async () => {
    await expect(page).toHaveTitle("Account · Administration · Finanzas");
    await expect(heading(/Beto Inglés/)).toBeVisible();
    await expect(field("Role")).toHaveText("User");
    await expect(field("Status")).toHaveText("Active");
    await expect(field("Lock")).toHaveText("Not locked");
    await expect(visible(page.getByText("1 session · most recent first"))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await visible(page.getByRole("region", { name: "Actions" }).getByRole("button", { name: "Sign out" })).click();
    const dialog = page.getByRole("dialog", { name: "Sign Beto Inglés out of all their sessions?" });
    await dialog.getByLabel("Google Authenticator code").fill(wrongCode(secret));
    await dialog.getByRole("button", { name: "Sign out" }).click();
    await expect(dialog.getByText("The code isn't right. You have 4 attempts left.")).toBeVisible();
    await dialog.getByLabel("Google Authenticator code").fill(totp(secret));
    await dialog.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("region", { name: "Notices" }).getByText("Beto Inglés was signed out of 1 session.")).toBeVisible();
    await expect(visible(page.getByText("It has no open sessions."))).toBeVisible();
    await expect(visible(page.getByText("There's nothing to unlock, sign out or unlink."))).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "All accounts" }))).toHaveAttribute("href", "/admin/usuarios");
  });

  await beto.context().close();
});
