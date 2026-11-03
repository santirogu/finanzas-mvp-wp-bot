import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { addBudget, addTransaction, newPerson, register, test, toast, visible } from "./helpers";

// Los valores de la app (/admin/configuracion), de punta a punta: el admin cambia los avisos por defecto y los
// umbrales, y una persona lo nota en su Configuración, en el aviso de un presupuesto, en Fijos y en la Ayuda.
// Cambia lo que vale para toda la app, así que corre en el proyecto "configuracion" (playwright.config.ts), un
// archivo a la vez y nunca a la vez que las demás pruebas. Empieza y termina con los de siempre.
test.describe.configure({ mode: "default" });

async function resetValues() {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`delete from app_values`;
  await sql.end();
}
test.beforeEach(resetValues);
test.afterAll(resetValues);

const card = (page: Page) => visible(page.getByRole("region", { name: "Valores de la app" }));
const dialog = (page: Page) => page.getByRole("dialog");

test("el admin cambia los valores de la app y una cuenta lo nota en sus avisos, sus presupuestos, Fijos y la Ayuda", async ({ page, browser }) => {
  const ana = await newPerson(browser);
  await register(ana, "Ana Valores");
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto("/admin/configuracion");
  await expect(heading(page, "Valores de la app")).toBeVisible();
  await expect(card(page)).toContainText("Sin cambios: los de siempre.");

  await test.step("con el código: avisos con 5 días, cerca desde el 50 % y fijos en 2 de 3 meses", async () => {
    await card(page).getByRole("button", { name: "Cambiar los valores" }).click();
    await dialog(page).getByLabel("Días antes").fill("5");
    await dialog(page).getByLabel("Se acercan desde el (%)").fill("50");
    await dialog(page).getByLabel("En al menos (meses)").fill("2");
    await dialog(page).getByLabel("De los últimos (meses)").fill("3");
    expect(await seriousViolations(page)).toEqual([]);
    await dialog(page).getByLabel("Código de Google Authenticator").fill(totp(secret));
    await dialog(page).getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(toast(page, "Se guardaron los valores de la app.")).toBeFocused();
    await expect(card(page)).toContainText("Prendidos: 5 días antes.");
    await expect(card(page)).toContainText("Se acercan desde el 50 %");
    await expect(card(page)).toContainText("en al menos 2 de los últimos 3 meses");
    await expect(card(page)).toContainText(/Último cambio: Ana Admin · /);
  });

  await test.step("Ana, que nunca cambió sus avisos, los tiene con 5 días", async () => {
    await ana.goto("/configuracion#notificaciones");
    await expect(visible(ana.getByLabel("Días de anticipación"))).toHaveValue("5");
  });

  await test.step("un egreso que llega al 60 % de un presupuesto ya avisa que se acerca", async () => {
    await addBudget(ana, "Alimentación", "100000");
    await ana.goto("/egresos");
    await addTransaction(ana, { amount: "60000", description: "Mercado de la semana", category: "Alimentación" });
    await expect(visible(ana.getByRole("status").filter({ hasText: "Alimentación: llevas" }))).toContainText(
      "Alimentación: llevas $60.000,00 de $100.000,00 (60 %)",
    );
  });

  await test.step("Fijos y la Ayuda explican la regla y los valores nuevos", async () => {
    await ana.goto("/gastos-fijos");
    await expect(visible(ana.getByText("Los egresos con la misma descripción en al menos 2 de los últimos 3 meses, y los que agregaste tú."))).toBeVisible();
    await ana.goto("/ayuda");
    const main = visible(ana.getByRole("main"));
    await expect(main).toContainText("al menos 2 de los últimos 3 meses");
    await expect(main).toContainText("5 días antes si no lo cambias");
    await expect(main).toContainText("Desde el 50 % del presupuesto");
  });

  await test.step("el historial guarda qué cambió", async () => {
    await page.goto("/admin/historial?tipo=admin");
    const item = visible(page.getByRole("listitem").filter({ hasText: "Ana Admin cambió los valores de la app" })).first();
    await expect(item).toContainText("avisos de pagos: ahora prendidos, 5 días (antes prendidos, 3 días)");
    await expect(item).toContainText("cerca del presupuesto: ahora 50 % (antes 80 %)");
    await expect(item).toContainText("gastos fijos: ahora 2 de 3 meses (antes 3 de 4 meses)");
  });
  await ana.context().close();
});
