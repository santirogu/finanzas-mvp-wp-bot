import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { addTransaction, openTab, register, test, visible } from "./helpers";

// Accesibilidad con axe-core (reglas WCAG 2.1 A y AA): falla ante problemas graves o críticos,
// como contraste insuficiente, campos sin etiqueta o botones sin nombre.
async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
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
  for (const path of ["/", "/login", "/registro", "/privacidad", "/eliminar-datos"]) {
    test(`${path} no tiene problemas graves de accesibilidad`, async ({ page }) => {
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
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

  test("los errores del formulario tampoco", async ({ page }) => {
    await addTransaction(page, { amount: "0", description: "Inválido" });
    await expect(visible(page.getByText("Ingresa un monto mayor que cero"))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
