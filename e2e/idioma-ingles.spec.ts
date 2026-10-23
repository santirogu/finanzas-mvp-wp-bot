import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { totp } from "../test/totp";
import { newAdmin, setUpTwoFactor, wrongCode } from "./admin";
import { PASSWORD, addTransaction, logIn, newPerson, register, test, toast, uniqueEmail, visible } from "./helpers";

// El inglés: casi todas las pruebas lo ponen directo con la cookie `idioma=en`; al final, cómo se elige
// (Mi cuenta, que viaja con la cuenta a otro navegador) y la primera visita en el idioma del navegador.
// Siempre con la misma dirección de siempre y el <html lang="en">.

const inEnglish = (page: Page) => page.context().addCookies([{ name: "idioma", value: "en", domain: "localhost", path: "/" }]);

const seriousViolations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);

test("sin sesión: la portada, el login y el registro en inglés, con sus mensajes @principal", async ({ page }) => {
  await inEnglish(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Text your expense on WhatsApp. It's noted." }))).toBeVisible();

  await visible(page.getByRole("link", { name: "Sign in" })).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("Sign in · Anotado");
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
  await expect(page).toHaveTitle("Page not found · Anotado");
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
  await expect(page).toHaveTitle("Expenses · Anotado");

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
  await expect(page).toHaveTitle("Overview · Anotado");
  await expect(visible(page.getByText("Balance for the month"))).toBeVisible();
  await expect(visible(page.getByText("−$1,250.50")).first()).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Latest transactions" }))).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: "Expenses by category" }))).toBeVisible();
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
  await expect(page).toHaveTitle("Reports · Anotado");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Reports" }))).toBeVisible();
  await expect(visible(page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Last 12 months" }))).toHaveAttribute("aria-current", "page");
  await expect(visible(page.getByRole("region", { name: "Period summary" }))).toContainText("$1,250.50");
  await expect(visible(page.getByRole("heading", { name: "Expenses by category" }))).toBeVisible();
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

test("en inglés: Mi cuenta, Configuración, la Ayuda y las páginas legales (solo en español, con su nota) @principal", async ({ page }) => {
  await register(page);
  await inEnglish(page);

  await page.goto("/cuenta");
  await expect(page).toHaveTitle("My account · Anotado");
  await expect(visible(page.getByRole("heading", { level: 1, name: "My account" }))).toBeVisible();
  await expect(visible(page.getByRole("region", { name: "Your details" }))).toContainText("User");
  await expect(visible(page.getByRole("region", { name: "Security" }))).toBeVisible();
  await expect(visible(page.getByLabel("Type DELETE to confirm"))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await visible(page.getByRole("link", { name: "Settings" })).click();
  await expect(page).toHaveURL(/\/configuracion$/);
  await expect(page).toHaveTitle("Settings · Anotado");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Settings" }))).toBeVisible();
  for (const name of ["Budgets", "Notifications", "Appearance", "Language"]) {
    await expect(visible(page.getByRole("region", { name }))).toBeVisible();
  }
  await visible(page.getByRole("button", { name: "Add a budget" })).click();
  await expect(page.getByRole("dialog").getByLabel("Amount per month")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  await page.goto("/ayuda");
  await expect(page).toHaveTitle("Help · Anotado");
  const topics = visible(page.getByRole("region", { name: "Help topics" }));
  await topics.locator("summary", { hasText: "The WhatsApp bot" }).click();
  await expect(topics).toContainText("For now the bot answers in Spanish.");
  const faq = visible(page.getByRole("region", { name: "Frequently asked questions" }));
  await faq.locator("summary", { hasText: "How do I change my WhatsApp number?" }).click();
  await expect(faq).toContainText("tap Unlink number");
  const closed = page.locator("main details:not([open])");
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
    await expect(page).toHaveTitle("Security · Administration · Anotado");
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
    await expect(page).toHaveTitle("Administration · Anotado");
    await expect(page.getByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    const nav = visible(page.getByRole("navigation", { name: "Administration sections" }));
    await expect(nav.getByRole("link")).toHaveText(["Home", "History", "Users", "WhatsApp bot", "Categories", "System health", "Security"]);
    await expect(visible(page.getByText("Two-step verification on"))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await nav.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
  });

  await test.step("Usuarios: la búsqueda, los filtros y la cuenta", async () => {
    await expect(page).toHaveTitle("Users · Administration · Anotado");
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
    await expect(page).toHaveTitle("Account · Administration · Anotado");
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

test("en inglés: el Historial, el Bot y Categorías de la administración @principal", async ({ page }) => {
  const id = Date.now() % 100_000;
  const email = await newAdmin(page);
  await setUpTwoFactor(page);
  await inEnglish(page);
  const heading = (name: string | RegExp) => visible(page.getByRole("heading", { name }));

  await test.step("Historial: sus eventos, agrupados por día", async () => {
    await page.goto("/admin/historial");
    await expect(page).toHaveTitle("History · Administration · Anotado");
    await expect(heading("Sign-ups and WhatsApp linking")).toBeVisible();
    const search = visible(page.getByRole("searchbox", { name: "Search" }));
    await search.fill(email);
    await search.press("Enter");
    // Todos los admins de las E2E se llaman Ana Admin: hasta que se aplica la búsqueda hay varios.
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(email);
    await expect(heading("Today")).toBeVisible();
    await expect(visible(page.getByText("Ana Admin signed up"))).toHaveCount(1);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("Bot: sus secciones y la ventana de los topes (sin cambiarlos)", async () => {
    await page.goto("/admin/bot");
    await expect(page).toHaveTitle("WhatsApp bot · Administration · Anotado");
    for (const name of ["Settings", "What happened with the messages", "By account", "Claude usage", "Errors"]) {
      await expect(heading(name)).toBeVisible();
    }
    expect(await seriousViolations(page)).toEqual([]);
    await visible(page.getByRole("button", { name: "Change the limits per account" })).click();
    const dialog = page.getByRole("dialog", { name: "Change the limits per account" });
    await expect(dialog).toContainText("Up to 200 per hour and 2,000 per day.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step("Salud del sistema: sus secciones y los despliegues", async () => {
    await page.goto("/admin/salud");
    await expect(page).toHaveTitle("System health · Administration · Anotado");
    for (const name of ["System health", "Version", "Database", "Daily cleanup", "Connections", "Recent deployments"]) {
      await expect(heading(name)).toBeVisible();
    }
    await expect(visible(page.getByText("Every day at 4:00 AM (Colombia time)", { exact: false }))).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "v9.2.0" }))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("Categorías: crear una y verla en los cambios recientes", async () => {
    await page.goto("/admin/categorias");
    await expect(page).toHaveTitle("Categories · Administration · Anotado");
    await expect(visible(page.getByRole("navigation", { name: "Category type" }).getByRole("link", { name: /^Expenses · \d+$/ }))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    const name = `Juegos ${id}`;
    await visible(page.getByRole("button", { name: "New category" })).click();
    const dialog = page.getByRole("dialog", { name: "New expense category" });
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog.getByRole("textbox", { name: "English name (optional)" }).fill(`Games ${id}`);
    await dialog.getByRole("button", { name: "Use 🎬" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("region", { name: "Notices" }).getByText(`The category 🎬 ${name} was created.`)).toBeVisible();
    const changes = visible(page.getByRole("list", { name: "Recent changes" }));
    await expect(changes).toContainText(`Ana Admin created 🎬 ${name} (expenses)`);
    await expect(changes).toContainText(`in English: Games ${id}`);
  });

  await test.step("con la app en inglés, la categoría se ve con su nombre en inglés", async () => {
    await page.goto("/egresos");
    const options = visible(page.locator("form").getByLabel("Category")).locator("option");
    await expect(options.filter({ hasText: `Games ${id}` })).toHaveCount(1);
    await expect(options.filter({ hasText: `Juegos ${id}` })).toHaveCount(0);
  });
});

test("elegir el idioma en Configuración: la app cambia, y la cuenta lo lleva a otro navegador @principal", async ({ page, browser }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);

  await test.step("en Configuración, English: Configuración vuelve en inglés, con el aviso", async () => {
    await page.goto("/configuracion");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const language = visible(page.getByRole("group", { name: "Idioma" }));
    await expect(language.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(await seriousViolations(page)).toEqual([]);
    await language.locator("label", { hasText: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(/\/configuracion(#idioma)?$/);
    await expect(visible(page.getByRole("heading", { level: 1, name: "Settings" }))).toBeVisible();
    await expect(page.getByRole("region", { name: "Notices" }).getByText("Language saved")).toBeVisible();
    await expect(visible(page.getByRole("group", { name: "Language" })).getByRole("radio", { name: "English" })).toBeChecked();
    await page.goto("/dashboard");
    await expect(visible(page.getByRole("navigation").getByRole("link", { name: "Overview" }))).toBeVisible();
  });

  await test.step("en otro navegador (en español), al entrar con la cuenta queda en inglés", async () => {
    const other = await newPerson(browser);
    await other.goto("/login");
    await expect(other.locator("html")).toHaveAttribute("lang", "es");
    await logIn(other, email);
    await expect(other).toHaveURL(/\/dashboard$/);
    await expect(other.locator("html")).toHaveAttribute("lang", "en");

    // De vuelta a español desde ese navegador.
    await other.goto("/configuracion");
    await visible(other.getByRole("group", { name: "Language" })).locator("label", { hasText: "Español" }).click();
    await expect(other.locator("html")).toHaveAttribute("lang", "es");
    await expect(other.getByRole("region", { name: "Avisos" }).getByText("Idioma guardado")).toBeVisible();
    await other.context().close();
  });
});

test("la primera visita es en español aunque el navegador esté en inglés; ES · EN lo cambia y se recuerda @principal", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect((await context.cookies()).map((c) => c.name)).not.toContain("idioma");
  const languages = visible(page.getByRole("group", { name: "Idioma" }));
  await expect(languages.getByRole("button", { name: "Español" })).toHaveAttribute("aria-pressed", "true");

  // EN: la misma página, en inglés, y queda guardado para las demás.
  await languages.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveURL(/\/$/);
  await expect(visible(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "English" }))).toHaveAttribute("aria-pressed", "true");
  await page.goto("/login");
  await expect(visible(page.getByRole("heading", { level: 1, name: "Sign in" }))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // ES desde el login: se queda en el login, en español.
  await visible(page.getByRole("group", { name: "Language" })).getByRole("button", { name: "Español" }).click();
  await expect(visible(page.getByRole("heading", { level: 1, name: "Inicia sesión" }))).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test("cambiar de idioma no cambia la apariencia elegida (ni al elegirlo ni al entrar con la cuenta) @principal", async ({ page, browser }) => {
  // El sistema en oscuro y la apariencia en Claro: si se perdiera, se vería oscura.
  await page.emulateMedia({ colorScheme: "dark" });
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  await page.goto("/configuracion");
  await visible(page.getByRole("group", { name: "Apariencia" })).locator("label", { hasText: "Claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await test.step("al elegir English en Configuración", async () => {
    await visible(page.getByRole("group", { name: "Idioma" })).locator("label", { hasText: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const appearance = visible(page.getByRole("group", { name: "Appearance" }));
    await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();
    // El selector sigue funcionando.
    await appearance.locator("label", { hasText: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await appearance.locator("label", { hasText: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  await test.step("al entrar en otro navegador (en español) con la cuenta en inglés", async () => {
    const other = await newPerson(browser);
    await other.emulateMedia({ colorScheme: "dark" });
    await other.goto("/login");
    await other.evaluate(() => localStorage.setItem("tema", "light"));
    await other.reload();
    await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
    await logIn(other, email);
    await expect(other.locator("html")).toHaveAttribute("lang", "en");
    await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
    await other.context().close();
  });
});
