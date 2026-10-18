import { randomInt } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { addTransaction, closeToasts, fakeIp, openTab, register, test, toast, toasts, uniqueEmail, visible } from "./helpers";

// Categorías en la administración (/admin/categorias), de punta a punta: lo que hace el admin se ve
// de inmediato en los formularios de las personas. Las pruebas corren en paralelo y comparten las
// categorías: cada una crea las suyas con un nombre único y nunca toca las de por defecto.

const tag = () => String(randomInt(100_000, 999_999));
const dialog = (page: Page) => page.getByRole("dialog");
const statusMessage = (page: Page) => toasts(page).last();
const row = (page: Page, name: string) =>
  visible(page.getByRole("listitem").filter({ has: page.locator("p", { hasText: new RegExp(`^${name}`) }) }));
const changes = (page: Page) => visible(page.getByRole("list", { name: "Cambios recientes" })).getByRole("listitem");
const categoryOptions = (page: Page) =>
  visible(page.locator("form").filter({ has: page.getByLabel("Monto") })).getByLabel("Categoría").locator("option");

/** El código de ahora o, para la siguiente acción con código, el del período siguiente. */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

async function adminInCategories(page: Page) {
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await visible(page.getByRole("navigation", { name: "Secciones de administración" }).getByRole("link", { name: "Categorías" })).click();
  await expect(page).toHaveURL(/\/admin\/categorias$/);
  await expect(heading(page, "Categorías")).toBeVisible();
  return secret;
}

async function person(browser: Browser) {
  const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } })).newPage();
  await register(page, "Persona Categorías", uniqueEmail());
  await openTab(page, "Egresos");
  return page;
}

async function createCategory(page: Page, name: string, emoji: string) {
  await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
  await dialog(page).getByLabel("Nombre").fill(name);
  await dialog(page).getByRole("textbox", { name: /^Emoji \(/ }).fill(emoji);
  await dialog(page).getByRole("button", { name: "Crear" }).click();
  await expect(statusMessage(page)).toHaveText(`Se creó la categoría ${emoji} ${name}.`);
}

async function fromMenu(page: Page, name: string, action: "Archivar" | "Eliminar") {
  await row(page, name).getByRole("button", { name: `Más acciones para ${name}` }).click();
  await row(page, name).getByRole("button", { name: new RegExp(`^${action}`) }).click();
}

async function confirmWithCode(page: Page, code: string, button: string) {
  await dialog(page).getByLabel("Código de Google Authenticator").fill(code);
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
}

test("el admin crea, renombra, archiva y restaura una categoría, y las personas lo ven al instante @principal", async ({ page, browser }) => {
  const id = tag();
  const secret = await adminInCategories(page);
  const ana = await person(browser);

  await test.step("crear: aparece en el formulario de las personas", async () => {
    await createCategory(page, `Café ${id}`, "☕");
    await expect(row(page, `Café ${id}`)).toContainText("Sin movimientos");
    expect(await seriousViolations(page), "lista").toEqual([]);

    await ana.reload();
    await expect(categoryOptions(ana).filter({ hasText: `☕ Café ${id}` })).toHaveCount(1);
    // Otros sigue al final.
    await expect(categoryOptions(ana).last()).toHaveText(/Otros$/);
    await addTransaction(ana, { amount: "8000", description: `Tinto ${id}`, category: `Café ${id}` });
    await expect(toast(ana, /^Egreso registrado$/)).toBeVisible();
  });

  await test.step("renombrar: su movimiento se ve con el nombre nuevo", async () => {
    await page.reload();
    await expect(row(page, `Café ${id}`)).toContainText("1 movimiento");
    await row(page, `Café ${id}`).getByRole("button", { name: `Editar Café ${id}` }).click();
    await dialog(page).getByLabel("Nombre").fill(`Cafetería ${id}`);
    await dialog(page).getByRole("button", { name: "Guardar" }).click();
    await expect(statusMessage(page)).toHaveText(`Se guardó la categoría ☕ Cafetería ${id}.`);
    await ana.reload();
    await expect(visible(ana.getByText(new RegExp(`Cafetería ${id}`))).first()).toBeVisible();
  });

  await test.step("archivar (con código): sale del formulario, pero su movimiento la conserva", async () => {
    await fromMenu(page, `Cafetería ${id}`, "Archivar");
    await expect(dialog(page)).toHaveAccessibleName(`¿Archivar la categoría Cafetería ${id}?`);
    expect(await seriousViolations(page), "ventana de archivar").toEqual([]);
    await confirmWithCode(page, codeFor(secret), "Archivar");
    await expect(statusMessage(page)).toHaveText(`Se archivó la categoría ☕ Cafetería ${id}.`);
    const archived = visible(page.getByRole("list", { name: "Categorías archivadas de egresos" }));
    await expect(archived.getByRole("listitem").filter({ hasText: `Cafetería ${id}` })).toHaveCount(1);

    await ana.reload();
    await expect(categoryOptions(ana).filter({ hasText: `Cafetería ${id}` })).toHaveCount(0);
    await expect(visible(ana.getByText(new RegExp(`Cafetería ${id}`))).first()).toBeVisible();
    // Al editarlo, la conserva (marcada) y se puede guardar sin perderla.
    await visible(ana.getByRole("link", { name: `Editar Tinto ${id}` })).click();
    const select = visible(ana.getByLabel("Categoría"));
    await expect(select.locator("option:checked")).toHaveText(`☕ Cafetería ${id} (archivada)`);
    await visible(ana.getByRole("button", { name: "Guardar cambios" })).click();
    await expect(ana).toHaveURL(/\/egresos$/);
    await expect(visible(ana.getByText(new RegExp(`Cafetería ${id}`))).first()).toBeVisible();
  });

  await test.step("restaurar (sin código): vuelve al formulario", async () => {
    // El aviso de archivar puede tapar el botón (la lista de archivadas queda abajo).
    await closeToasts(page);
    await row(page, `Cafetería ${id}`).getByRole("button", { name: `Restaurar Cafetería ${id}` }).click();
    await expect(statusMessage(page)).toHaveText(`Se restauró la categoría ☕ Cafetería ${id}.`);
    await ana.reload();
    await expect(categoryOptions(ana).filter({ hasText: `☕ Cafetería ${id}` })).toHaveCount(1);
  });

  await test.step("todo queda en Cambios recientes", async () => {
    const mine = changes(page).filter({ hasText: id });
    await expect(mine).toHaveCount(4);
    await expect(mine.nth(0)).toContainText(`Ana Admin restauró ☕ Cafetería ${id} (egresos)`);
    await expect(mine.nth(1)).toContainText(`Ana Admin archivó ☕ Cafetería ${id} (egresos)`);
    await expect(mine.nth(2)).toContainText(`Ana Admin renombró Café ${id} a ☕ Cafetería ${id} (egresos)`);
    await expect(mine.nth(3)).toContainText(`Ana Admin creó ☕ Café ${id} (egresos)`);
  });

  await ana.context().close();
});

test("eliminar: sin movimientos se borra; con movimientos avisa y estos pasan a Otros", async ({ page, browser }) => {
  const id = tag();
  const secret = await adminInCategories(page);
  await createCategory(page, `Por error ${id}`, "❌");
  await createCategory(page, `Mascotas ${id}`, "🐾");
  const ana = await person(browser);
  await addTransaction(ana, { amount: "50000", description: `Veterinario ${id}`, category: `Mascotas ${id}` });
  await expect(toast(ana, /^Egreso registrado$/)).toBeVisible();

  await test.step("sin movimientos", async () => {
    await page.reload();
    await fromMenu(page, `Por error ${id}`, "Eliminar");
    await expect(dialog(page)).toHaveAccessibleDescription(
      "No tiene movimientos. La eliminación queda en el registro de cambios y no se puede deshacer.",
    );
    await confirmWithCode(page, codeFor(secret), "Eliminar");
    await expect(statusMessage(page)).toHaveText(`Se eliminó la categoría ❌ Por error ${id}.`);
    await expect(row(page, `Por error ${id}`)).toHaveCount(0);
  });

  await test.step("con movimientos: el aviso, y pasan a Otros", async () => {
    await fromMenu(page, `Mascotas ${id}`, "Eliminar");
    await expect(dialog(page)).toHaveAccessibleDescription(/^Tiene 1 movimiento\. Si la eliminas, pasarán a .+ Otros\./);
    expect(await seriousViolations(page), "ventana de eliminar").toEqual([]);
    await confirmWithCode(page, codeFor(secret, 1), "Eliminar y pasar a Otros");
    await expect(statusMessage(page)).toHaveText(`Se eliminó la categoría 🐾 Mascotas ${id}; 1 movimiento pasó a Otros.`);
    await expect(changes(page).filter({ hasText: `Mascotas ${id}` }).first()).toContainText("1 movimiento pasó a Otros");

    await ana.reload();
    const movement = visible(ana.getByRole("listitem").filter({ hasText: `Veterinario ${id}` }));
    await expect(movement).toContainText("Otros");
    await expect(movement).not.toContainText(`Mascotas ${id}`);
  });

  await ana.context().close();
});

test("Otros no se archiva, no se elimina ni se renombra; los nombres no se repiten", async ({ page }) => {
  await adminInCategories(page);
  const otros = row(page, "Otros");
  await expect(otros).toContainText("Por defecto");
  await expect(otros.getByRole("button", { name: /Más acciones/ })).toHaveCount(0);
  await otros.getByRole("button", { name: "Editar Otros" }).click();
  await expect(dialog(page).getByLabel("Nombre")).toHaveAttribute("readonly", "");
  await dialog(page).getByRole("button", { name: "Cancelar" }).click();

  await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
  await dialog(page).getByLabel("Nombre").fill("MÉRCADO");
  await dialog(page).getByRole("button", { name: "Crear" }).click();
  await expect(dialog(page).getByText("Ya hay una categoría de egresos con ese nombre.")).toBeVisible();
  await expect(dialog(page).getByLabel("Nombre")).toHaveAttribute("aria-invalid", "true");
});

test("las pestañas llevan a ingresos y egresos; Otros va al final en las dos", async ({ page }) => {
  await adminInCategories(page);
  const tabs = visible(page.getByRole("navigation", { name: "Tipo de categoría" }));
  await expect(tabs.getByRole("link", { name: /^Egresos · \d+$/ })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: /^Ingresos · \d+$/ }).click();
  await expect(page).toHaveURL(/\?tipo=ingresos$/);
  await expect(tabs.getByRole("link", { name: /^Ingresos/ })).toHaveAttribute("aria-current", "page");
  const incomes = visible(page.getByRole("list", { name: "Categorías de ingresos" })).getByRole("listitem");
  await expect(incomes.last()).toContainText("Otros");
  await expect(incomes.filter({ hasText: "Salario" })).toHaveCount(1);
});

test("a un usuario normal no le llega nada de Categorías", async ({ page }) => {
  await register(page);
  const response = await page.goto("/admin/categorias");
  await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
  const html = (await response!.text()) + (await page.content());
  for (const text of ["Nueva categoría", "Cambios recientes", "Tipo de categoría"]) expect(html, text).not.toContain(text);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`en celular y en modo ${colorScheme === "light" ? "claro" : "oscuro"}, la lista y las ventanas se ven completas y sin problemas de accesibilidad`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await adminInCategories(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.reload();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), "lista").toEqual([]);

    await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
    await expect(dialog(page)).toBeVisible();
    const box = (await dialog(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await dialog(page).getByRole("button", { name: "Crear" }).hover();
    expect(await seriousViolations(page), "ventana de crear").toEqual([]);
    await dialog(page).getByRole("button", { name: "Cancelar" }).click();

    await fromMenu(page, "Mercado", "Eliminar");
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: /^Eliminar/ }).hover();
    expect(await seriousViolations(page), "ventana de eliminar").toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });
}
