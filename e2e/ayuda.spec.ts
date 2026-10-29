import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { CONTACT_EMAIL } from "../src/lib/contact";
import { BOT_COMMANDS, BOT_EXAMPLES } from "../src/modules/bot/help";
import { MAX_TRANSACTIONS_PER_MESSAGE } from "../src/modules/bot/limits";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW } from "../src/modules/reports/recurring";
import { DAYS_AHEAD, MAX_DAYS_AHEAD } from "../src/modules/reports/upcoming";
import { closeTutorial, openAccountMenu, PASSWORD, register, test, uniqueEmail, visible } from "./helpers";

// Ayuda (desde el menú de la cuenta): los temas y las preguntas frecuentes, que se abren, y lo que dicen sale
// de lo mismo que usa la app (los comandos del bot, los meses de los gastos fijos, los días de los avisos, el
// tope de movimientos por mensaje). Sin sesión, en la misma dirección, la versión pública (src/proxy.ts).

test("Ayuda: se abre desde el menú de la cuenta, con sus temas cerrados y lo mismo que dice el bot @principal", async ({ page }) => {
  await register(page);
  await visible(page.getByRole("button", { name: /^Tu cuenta/ })).click();
  await visible(page.getByRole("link", { name: "Ayuda" })).click();
  await expect(page).toHaveURL(/\/ayuda$/);
  await expect(visible(page.getByRole("heading", { level: 1, name: "Ayuda" }))).toBeVisible();

  const topics = visible(page.getByRole("region", { name: "Temas de ayuda" }));
  const topic = (name: string) => topics.locator("details").filter({ has: page.locator("summary", { hasText: name }) });
  await expect(topics.locator("details")).toHaveCount(6);
  await expect(topics.locator("details[open]")).toHaveCount(0);

  await test.step("el bot de WhatsApp: los mismos ejemplos y comandos de su respuesta a 'ayuda'", async () => {
    await topic("El bot de WhatsApp").locator("summary").click();
    const bot = topic("El bot de WhatsApp");
    for (const example of BOT_EXAMPLES) await expect(bot).toContainText(example);
    for (const { command, description } of BOT_COMMANDS) {
      await expect(bot.locator("li", { hasText: description.es }).locator("strong").first()).toHaveText(command);
    }
  });

  await test.step("los gastos fijos y los avisos, con los números de la app", async () => {
    await topic("Gastos fijos y avisos de pagos").locator("summary").click();
    const fixed = topic("Gastos fijos y avisos de pagos");
    await expect(fixed).toContainText(`al menos ${RECURRING_MIN_MONTHS} de los últimos ${RECURRING_WINDOW} meses`);
    await expect(fixed).toContainText(`${DAYS_AHEAD} días antes`);
    await expect(fixed).toContainText(`a ${MAX_DAYS_AHEAD})`);
  });

  const faq = visible(page.getByRole("region", { name: "Preguntas frecuentes" }));
  const question = (name: string) => faq.locator("details").filter({ has: page.locator("summary", { hasText: name }) });

  await test.step("las preguntas frecuentes, abajo y cerradas, con los límites de la app", async () => {
    await expect(faq.getByRole("heading", { level: 2, name: "Preguntas frecuentes" })).toBeVisible();
    await expect(faq.locator("details")).toHaveCount(12);
    await expect(faq.locator("details[open]")).toHaveCount(0);
    await question("¿Por qué el bot no entendió mi mensaje?").locator("summary").click();
    await expect(question("¿Por qué el bot no entendió mi mensaje?")).toContainText(`hasta ${MAX_TRANSACTIONS_PER_MESSAGE} movimientos`);
    await question("¿Puedo recuperar un movimiento que borré?").locator("summary").click();
    await expect(question("¿Puedo recuperar un movimiento que borré?")).toContainText("Cuando el aviso se va, ya no se puede recuperar.");
    await question("Olvidé mi contraseña").locator("summary").click();
    await expect(question("Olvidé mi contraseña").getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  await test.step("todos abiertos, sin problemas de accesibilidad; sus enlaces llevan a cada página", async () => {
    const closed = page.locator("main details:not([open])");
    while ((await closed.count()) > 0) await closed.first().locator("summary").click();
    await expect(topics.locator("details[open]")).toHaveCount(6);
    await expect(faq.locator("details[open]")).toHaveCount(12);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await topic("Reportes y descargas").getByRole("link", { name: "Reportes" }).click();
    await expect(page).toHaveURL(/\/reportes$/);
  });
});

test("Ayuda sin sesión: desde la portada, el login y el registro, en /ayuda, con lo mismo y sin enlaces a la app @principal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Ayuda" }).click();
  await expect(page).toHaveURL(/\/ayuda$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
  // Con la barra de la portada: sin las pestañas de la app ni el tutorial (es de la cuenta).
  await expect(page.getByRole("banner").getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver el tutorial de bienvenida" })).toHaveCount(0);

  const topics = page.getByRole("region", { name: "Temas de ayuda" });
  const faq = page.getByRole("region", { name: "Preguntas frecuentes" });
  await expect(topics.locator("details")).toHaveCount(6);
  await expect(faq.locator("details")).toHaveCount(12);

  await test.step("al final, para crear la cuenta; el pie, alineado con el texto (no suelto a la izquierda)", async () => {
    await expect(page.getByRole("main").getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
    const title = await page.getByRole("heading", { level: 1, name: "Ayuda" }).boundingBox();
    const privacy = await page.getByRole("contentinfo").getByRole("link", { name: "Política de privacidad" }).boundingBox();
    expect(Math.round(privacy!.x)).toBe(Math.round(title!.x));
  });

  await test.step("las páginas de la app van en negrita (su enlace llevaría al login); la privacidad, el correo y el registro, con enlace", async () => {
    const closed = page.locator("main details:not([open])");
    while ((await closed.count()) > 0) await closed.first().locator("summary").click();
    const bot = topics.locator("details").filter({ has: page.locator("summary", { hasText: "El bot de WhatsApp" }) });
    for (const { command, description } of BOT_COMMANDS) {
      await expect(bot.locator("li", { hasText: description.es }).locator("strong").first()).toHaveText(command);
    }
    await expect(bot.locator("strong", { hasText: "Mi cuenta" })).toBeVisible();
    const hrefs = await page.getByRole("main").getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect([...new Set(hrefs)].sort()).toEqual(["/privacidad", "/registro", `mailto:${CONTACT_EMAIL}`]);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });

  await test.step("en inglés con el selector, sin salir de /ayuda", async () => {
    await page.getByRole("button", { name: "EN English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    await expect(page).toHaveURL(/\/ayuda$/);
    await expect(page.getByRole("region", { name: "Help topics" }).locator("details")).toHaveCount(6);
    await page.getByRole("button", { name: "ES Español" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
  });

  await test.step("también desde el pie de la portada, el login y el registro", async () => {
    const links = [
      ["/", page.getByRole("contentinfo").getByRole("link", { name: "Ayuda" })],
      ["/login", page.getByRole("link", { name: "¿Necesitas ayuda?" })],
      ["/registro", page.getByRole("link", { name: "¿Necesitas ayuda?" })],
    ] as const;
    for (const [path, link] of links) {
      await page.goto(path);
      await link.click();
      await expect(page.getByRole("heading", { level: 1, name: "Ayuda" }), path).toBeVisible();
      await expect(page).toHaveURL(/\/ayuda$/);
    }
  });

  await test.step("la versión pública no tiene dirección propia: lleva a /ayuda", async () => {
    await page.goto("/ayuda-publica");
    await expect(page).toHaveURL(/\/ayuda$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
  });
});

test("después de ver la Ayuda sin sesión y entrar, la Ayuda es la de la app", async ({ page }) => {
  // Todo sin recargar (como lo haría una persona): la Ayuda pública no debe quedar en el navegador después de entrar.
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Necesitas ayuda?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "Iniciar sesión" }).click();
  await page.getByRole("link", { name: "Regístrate" }).click();
  // El login queda montado, pero oculto (Next 16): sus campos también se llaman Correo y Contraseña.
  await visible(page.getByLabel("Nombre")).fill("Ana Pérez");
  await visible(page.getByLabel("Correo")).fill(uniqueEmail());
  await visible(page.getByLabel("Contraseña")).fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await closeTutorial(page, "Omitir");

  await (await openAccountMenu(page)).getByRole("link", { name: "Ayuda" }).click();
  await expect(page).toHaveURL(/\/ayuda$/);
  await expect(visible(page.getByRole("button", { name: "Ver el tutorial de bienvenida" }))).toBeVisible();
  await expect(visible(page.getByRole("navigation"))).toBeVisible();
  const topics = visible(page.getByRole("region", { name: "Temas de ayuda" }));
  await topics.locator("summary", { hasText: "El bot de WhatsApp" }).click();
  await expect(topics.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
});
