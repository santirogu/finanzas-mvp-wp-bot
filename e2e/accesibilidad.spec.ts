import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { addTransaction, openTab, register, test, visible } from "./helpers";

// Accesibilidad con axe-core (reglas WCAG 2.1 A y AA): falla ante problemas graves o críticos,
// como contraste insuficiente, campos sin etiqueta o botones sin nombre.
async function seriousViolations(page: Page, { only }: { only?: string } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (only) builder = builder.include(only);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      regla: v.id,
      impacto: v.impact,
      problema: v.help,
      elementos: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
    }));
}

test.describe("páginas públicas", () => {
  for (const path of ["/", "/login", "/registro", "/privacidad", "/eliminar-datos", "/cuenta-eliminada"]) {
    test(`${path} no tiene problemas graves de accesibilidad`, async ({ page }) => {
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

test("el registro con la sugerencia de correo visible tampoco", async ({ page }) => {
  await page.goto("/registro");
  const email = page.getByLabel("Correo", { exact: true });
  await email.fill("ana@gmal.com");
  await email.blur();
  await expect(visible(page.getByText(/Quisiste decir/))).toBeVisible();

  // El campo conserva su nombre y la sugerencia queda como su descripción.
  await expect(page.getByRole("textbox", { name: "Correo", exact: true })).toHaveAccessibleDescription(
    /Quisiste decir ana@gmail\.com/,
  );
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe("páginas con sesión (y con datos)", () => {
  test.beforeEach(async ({ page }) => {
    await register(page);
    await openTab(page, "Egresos");
    await addTransaction(page, { amount: "120000", description: "Mercado", category: "Mercado" });
    await expect(visible(page.getByText("✓ Egreso registrado"))).toBeVisible();
  });

  for (const tab of ["Resumen", "Ingresos", "Egresos"] as const) {
    test(`${tab} no tiene problemas graves de accesibilidad`, async ({ page }) => {
      await openTab(page, tab);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test("el esqueleto de carga tampoco", async ({ page }) => {
    // Demora la respuesta del servidor al cambiar de pestaña: mientras tanto se ve el esqueleto.
    await page.route(/\/ingresos(\?|$)/, async (route) => {
      if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, 2_000));
      await route.continue();
    });
    await page.getByRole("navigation").getByRole("link", { name: "Ingresos", exact: true }).click();

    await expect(visible(page.getByRole("status", { name: "Cargando" }))).toBeVisible();
    // Solo el esqueleto: mientras la respuesta no llega, Next todavía no puso el <title> de la
    // página nueva (las demás pruebas revisan la página completa ya cargada).
    expect(await seriousViolations(page, { only: "[role=status]" })).toEqual([]);
  });

  test("la página 404 tampoco", async ({ page }) => {
    await page.goto("/esta-pagina-no-existe");
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("Mi cuenta tampoco", async ({ page }) => {
    await visible(page.getByRole("link", { name: "Mi cuenta" })).click();
    await expect(visible(page.getByRole("heading", { name: "Mi cuenta", exact: true }))).toBeVisible();
    await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("la página para editar un movimiento tampoco", async ({ page }) => {
    await visible(page.getByRole("link", { name: "Editar Mercado" })).click();
    await expect(page).toHaveURL(/\/editar$/);
    await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
    await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("los errores del formulario tampoco", async ({ page }) => {
    await addTransaction(page, { amount: "0", description: "Inválido" });
    await expect(visible(page.getByText("Ingresa un monto mayor que cero"))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
