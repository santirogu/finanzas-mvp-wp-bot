import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { adminCommand, register, test, uniqueEmail, visible } from "./helpers";

// La etiqueta "Admin" del encabezado, con el comando real de terminal (pnpm admin:grant / revoke)
// contra la base de las E2E: el mismo camino que usa el dueño en producción.

// La etiqueta (un <span>), no la pestaña "Admin" del menú, que también está en el encabezado.
const badge = (page: Page) => page.getByRole("banner").locator("span").filter({ hasText: /^Admin$/ });

test("la etiqueta Admin aparece al dar el rol y desaparece al quitarlo, sin volver a iniciar sesión", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  await expect(page.getByRole("banner").getByText("Ana Pérez")).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
  // Ni en el HTML ni en los datos que Next manda al navegador.
  expect(await page.content()).not.toContain("bg-admin-surface");

  expect(adminCommand("grant", email)).toContain("ahora tiene el rol admin");
  await page.reload();
  await expect(visible(badge(page))).toBeVisible();

  // En Mi cuenta, el tipo de cuenta.
  await visible(page.getByRole("link", { name: "Mi cuenta" })).click();
  await expect(visible(page.getByText("Tipo de cuenta:"))).toBeVisible();
  await expect(page.getByText("Administrador")).toBeVisible();

  // En celular el nombre no cabe, pero la etiqueta sigue a la vista.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole("banner").getByText("Ana Pérez")).toBeHidden();
  await expect(badge(page)).toBeVisible();

  expect(adminCommand("revoke", email)).toContain("ahora tiene el rol usuario");
  await page.reload();
  await expect(badge(page)).toHaveCount(0);
  await expect(page.getByText("Tipo de cuenta:").locator("..")).toContainText("Usuario");
});

test("un usuario normal nunca ve la etiqueta ni el texto Administrador", async ({ page }) => {
  await register(page);
  for (const path of ["/dashboard", "/ingresos", "/egresos", "/cuenta"]) {
    await page.goto(path);
    await expect(badge(page), path).toHaveCount(0);
    expect(await page.content(), path).not.toContain("bg-admin-surface");
  }
  await expect(page.getByText("Administrador")).toHaveCount(0);
  await expect(page.getByText("Tipo de cuenta:").locator("..")).toContainText("Usuario");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`la etiqueta tiene buen contraste en modo ${colorScheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const email = uniqueEmail();
    await register(page, "Ana Pérez", email);
    adminCommand("grant", email);
    await page.reload();
    await expect(visible(badge(page))).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .include("header")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
