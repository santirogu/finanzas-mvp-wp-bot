import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { BOT_COMMANDS, BOT_EXAMPLES } from "../src/modules/bot/help";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW } from "../src/modules/reports/recurring";
import { DAYS_AHEAD, MAX_DAYS_AHEAD } from "../src/modules/reports/upcoming";
import { register, test, visible } from "./helpers";

// Ayuda (desde el menú de la cuenta): los temas, que se abren, y lo que dicen sale de lo mismo que usa la
// app (los comandos del bot, los meses de los gastos fijos, los días de los avisos).

test("Ayuda: se abre desde el menú de la cuenta, con sus temas cerrados y lo mismo que dice el bot @principal", async ({ page }) => {
  await register(page);
  await visible(page.getByRole("button", { name: /^Tu cuenta/ })).click();
  await visible(page.getByRole("link", { name: "Ayuda" })).click();
  await expect(page).toHaveURL(/\/ayuda$/);
  await expect(visible(page.getByRole("heading", { level: 1, name: "Ayuda" }))).toBeVisible();

  const topics = visible(page.getByRole("region", { name: "Temas de ayuda" }));
  const topic = (name: string) => topics.locator("details").filter({ has: page.locator("summary", { hasText: name }) });
  await expect(topics.locator("details")).toHaveCount(5);
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

  await test.step("todos abiertos, sin problemas de accesibilidad; sus enlaces llevan a cada página", async () => {
    const closed = topics.locator("details:not([open])");
    while ((await closed.count()) > 0) await closed.first().locator("summary").click();
    await expect(topics.locator("details[open]")).toHaveCount(5);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await topic("Reportes y descargas").getByRole("link", { name: "Reportes" }).click();
    await expect(page).toHaveURL(/\/reportes$/);
  });
});
