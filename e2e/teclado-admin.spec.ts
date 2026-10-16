import { randomInt } from "node:crypto";
import { expect } from "@playwright/test";
import { totp } from "../test/totp";
import { heading, newAdmin, setUpTwoFactor } from "./admin";
import { test, visible } from "./helpers";

// En la administración, con el teclado (o un lector de pantalla), el foco nunca queda perdido al
// principio de la página: al terminar una acción va a su aviso, al cancelar una ventana vuelve al
// botón que la abrió (el "⋯" si se abrió desde su menú), el menú "⋯" se cierra con Esc o tocando
// afuera, y Tab no se detiene en botones que no se ven.

test("en la administración el foco no se pierde con las ventanas, el menú ⋯ y los filtros", async ({ page }) => {
  test.slow();
  const name = `Teclado ${randomInt(100_000, 999_999)}`;
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto("/admin/categorias");
  await expect(heading(page, "Categorías")).toBeVisible();
  const dialog = page.getByRole("dialog");
  const row = visible(page.getByRole("listitem").filter({ has: page.locator("p", { hasText: name }) }));
  const more = row.getByRole("button", { name: `Más acciones para ${name}` });
  const archive = row.getByRole("button", { name: /^Archivar/ });

  await test.step("crear con el teclado: el foco va al aviso", async () => {
    await visible(page.getByRole("button", { name: "Nueva categoría" })).focus();
    await page.keyboard.press("Enter");
    await dialog.getByLabel("Nombre").fill(name);
    await page.keyboard.press("Enter");
    await expect(visible(page.getByRole("status").filter({ hasText: name }))).toBeFocused();
  });

  await test.step("el menú ⋯ se cierra con Esc (el foco vuelve a él) y tocando afuera", async () => {
    await more.click();
    await expect(archive).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(archive).toBeHidden();
    await expect(more).toBeFocused();

    await more.click();
    await heading(page, "Categorías").click();
    await expect(archive).toBeHidden();
  });

  await test.step("cancelar con Esc la ventana abierta desde el ⋯ devuelve el foco al ⋯", async () => {
    await more.click();
    await archive.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  await test.step("archivar con el código: el foco va al aviso", async () => {
    await more.click();
    await archive.click();
    // El código del período siguiente: el de ahora ya se usó al activar la verificación.
    await dialog.getByLabel("Código de Google Authenticator").fill(totp(secret, Date.now() + 30_000));
    await dialog.getByRole("button", { name: "Archivar", exact: true }).click();
    await expect(visible(page.getByRole("status").filter({ hasText: /archivó/ }))).toBeFocused();
  });

  await test.step("en los filtros, Tab desde la búsqueda va al botón Filtros (no a uno invisible)", async () => {
    await page.goto("/admin/usuarios");
    await visible(page.getByRole("searchbox", { name: "Buscar" })).focus();
    await page.keyboard.press("Tab");
    await expect(visible(page.getByRole("button", { name: /Filtros/ }))).toBeFocused();
  });
});
