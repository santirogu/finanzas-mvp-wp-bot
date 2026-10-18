import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { openTab, register, test, toasts, visible } from "./helpers";

// Los errores de los campos, en un navegador de verdad: en español, debajo de cada campo y nunca el
// globo del navegador (eso lo revisa en todas las pruebas el fixture nativeValidation de helpers.ts).

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

const describedAs = (field: Locator, text: string) => expect(field).toHaveAccessibleDescription(text);

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme === "light" ? "modo claro" : "modo oscuro", () => {
    test.use({ colorScheme });

    test("crear cuenta: cada campo dice qué le falta, el cursor va al primero y se corrige al escribir", async ({ page }) => {
      await page.goto("/registro");
      await page.getByRole("button", { name: "Crear cuenta" }).click();
      await expect(page).toHaveURL(/\/registro$/);
      const name = page.getByLabel("Nombre");
      const email = page.getByLabel("Correo", { exact: true });
      const password = page.getByLabel("Contraseña");
      await describedAs(name, "Escribe tu nombre.");
      await describedAs(email, "Escribe tu correo.");
      await describedAs(password, "Escribe tu contraseña.");
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      expect(await seriousViolations(page)).toEqual([]);

      await name.fill("Ana");
      await expect(name).not.toHaveAttribute("aria-invalid");
      await email.fill("ana@");
      await describedAs(email, "Revisa el correo: debe verse como nombre@correo.com.");
      await password.fill("corta");
      await describedAs(password, "Debe tener al menos 8 caracteres (llevas 5).");
      await password.fill("clave-segura-123");
      await expect(password).not.toHaveAttribute("aria-invalid");
    });

    test("un egreso sin monto, sin descripción o con una fecha futura", async ({ page }) => {
      await register(page);
      await openTab(page, "Egresos");
      const form = visible(page.locator("form").filter({ has: page.getByLabel(/^Monto/) }));
      const date = form.getByLabel("Fecha");
      await date.fill("2099-01-01");
      await form.getByRole("button", { name: "Registrar egreso" }).click();
      await describedAs(form.getByLabel(/^Monto/), "Escribe el monto.");
      await describedAs(form.getByLabel("Descripción"), 'Escribe una descripción, por ejemplo "Almuerzo".');
      await describedAs(date, "La fecha no puede ser después de hoy.");
      await expect(form.getByLabel(/^Monto/)).toBeFocused();
      await expect(toasts(page)).toHaveCount(0);
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test("el login con un correo mal escrito no se envía", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana.gmail.com");
  await page.getByLabel("Contraseña").fill("clave-segura-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await describedAs(page.getByLabel("Correo"), "Revisa el correo: debe verse como nombre@correo.com.");
  await expect(page).toHaveURL(/\/login$/);
});
