import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { adminCommand, goToAccount, logIn, openAccountMenu, register, test, uniqueEmail, visible } from "./helpers";

// Lo de admin del encabezado, con el comando real de terminal (pnpm admin:grant / revoke) contra la
// base de las E2E: el mismo camino que usa el dueño en producción. El escudo va sobre el círculo de la
// cuenta (se ve siempre, también en celular) y la etiqueta "Admin", en la tarjeta del menú.

const shield = (page: Page) => page.getByRole("banner").locator("[data-admin-shield]");
const accountButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Tu cuenta: / });
// La etiqueta (un <span> en la tarjeta), no la pestaña "Admin", que también está en el encabezado.
const badge = (page: Page) => page.getByRole("group", { name: "Tu cuenta" }).locator("span").filter({ hasText: /^Admin$/ });

test("la etiqueta Admin aparece al dar el rol y desaparece al quitarlo (cada cambio pide volver a entrar)", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  await expect(accountButton(page)).toHaveAccessibleName("Tu cuenta: Ana Pérez");
  await expect(shield(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  // Ni en el HTML ni en los datos que Next manda al navegador.
  expect(await page.content()).not.toContain("bg-admin-surface");

  expect(adminCommand("grant", email)).toContain("ahora tiene el rol admin");
  // Dar el rol cierra sus sesiones: al volver a entrar va a configurar la verificación en dos pasos.
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await logIn(page, email);
  await expect(page).toHaveURL(/\/admin\/seguridad$/);
  await expect(accountButton(page)).toHaveAccessibleName("Tu cuenta: Ana Pérez, admin");
  await expect(visible(shield(page))).toBeVisible();
  await openAccountMenu(page);
  await expect(visible(badge(page))).toBeVisible();
  await page.keyboard.press("Escape");

  // En Mi cuenta, el tipo de cuenta.
  await goToAccount(page);
  await expect(visible(page.getByText("Tipo de cuenta:")).locator("..")).toContainText("Administrador");

  // En celular, con el menú cerrado, el escudo sigue a la vista.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(shield(page)).toBeVisible();

  expect(adminCommand("revoke", email)).toContain("ahora tiene el rol usuario");
  // Quitarlo también cierra sus sesiones; sin la verificación, vuelve a entrar solo con la contraseña.
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await logIn(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await goToAccount(page);
  await expect(shield(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
  await expect(page.getByText("Tipo de cuenta:").locator("..")).toContainText("Usuario");
});

test("un usuario normal nunca ve la etiqueta ni el texto Administrador", async ({ page }) => {
  await register(page);
  for (const path of ["/dashboard", "/ingresos", "/egresos", "/cuenta"]) {
    await page.goto(path);
    await expect(shield(page), path).toHaveCount(0);
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
    // Dar el rol cierra sus sesiones: vuelve a entrar (y va a configurar la verificación).
    adminCommand("grant", email);
    await page.context().clearCookies();
    await logIn(page, email);
    await expect(page).toHaveURL(/\/admin\/seguridad$/);
    await expect(visible(shield(page))).toBeVisible();
    // Con la tarjeta abierta: el escudo y la etiqueta a la vez.
    await openAccountMenu(page);
    await expect(visible(badge(page))).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .include("header")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
