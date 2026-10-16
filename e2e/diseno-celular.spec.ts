import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { heading, newAdmin, setUpTwoFactor } from "./admin";
import { addTransaction, openTab, test, visible } from "./helpers";

// En celular todo cabe en la pantalla, aunque los textos sean largos (sin scroll de lado), y los
// campos tienen letra de 16 px o más: con menos, Safari del iPhone hace zoom al tocarlos y la página
// queda corrida. Se revisa en el ancho del iPhone más angosto que se sigue usando (375) y en el del
// iPhone 17 Pro Max (440).

const WIDTHS = [375, 440];

/** Lo que no cabe en la pantalla, o los campos con letra de menos de 16 px. */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const problems: string[] = [];
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`;

    const pageWidth = document.documentElement.scrollWidth;
    if (pageWidth > width) {
      // De dónde viene: el primer elemento que se sale de la pantalla cuyo contenedor sí cabe.
      const origins = [...document.body.querySelectorAll("*")].filter(
        (el) =>
          el.getBoundingClientRect().right > width + 1 &&
          (el.parentElement?.getBoundingClientRect().right ?? 0) <= width + 1,
      );
      problems.push(`la página mide ${pageWidth} px de ancho en una pantalla de ${width} px: ${origins.slice(0, 3).map(describe).join(", ")}`);
    }
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      const rect = dialog.getBoundingClientRect();
      if (rect.left < 0 || rect.right > width) problems.push(`la ventana se sale de la pantalla: ${describe(dialog)}`);
    }
    const fields = document.querySelectorAll<HTMLInputElement>(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea",
    );
    for (const field of fields) {
      if (!field.checkVisibility()) continue;
      const size = parseFloat(getComputedStyle(field).fontSize);
      if (size < 16) problems.push(`el campo "${field.name || field.id}" tiene letra de ${size} px`);
    }
    return problems;
  });
}

/** Revisa la página actual en cada ancho (sin cortar la prueba: así se ven todos los problemas juntos). */
async function expectFitsOnPhones(page: Page, where: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    expect.soft(await layoutProblems(page), `${where} (${width} px)`).toEqual([]);
  }
}

/** Abre una página y espera a que termine de cargar (mientras tanto hay un esqueleto con aria-busy). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
  await expect(visible(page.getByRole("heading", { level: 1 })).first()).toBeVisible();
}

test("en celular las páginas caben en la pantalla y los campos no hacen zoom @celular", async ({ page }) => {
  test.slow();
  const id = String(randomInt(100_000, 999_999));
  // Lo más largo que se puede escribir: categorías de 40 caracteres y descripciones de 140.
  const category = `Suscripciones y servicios digitales ${id}`.slice(0, 40);
  const description = `Pago de la cuota de administración del conjunto residencial ${id} `.repeat(3).slice(0, 140);

  await test.step("páginas públicas", async () => {
    for (const path of ["/login", "/registro", "/privacidad"]) {
      await page.goto(path);
      await expectFitsOnPhones(page, path);
    }
  });

  await newAdmin(page);
  await setUpTwoFactor(page);

  await test.step("una categoría con el nombre más largo", async () => {
    await open(page, "/admin/categorias");
    await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
    const dialog = page.getByRole("dialog");
    await expectFitsOnPhones(page, "ventana de nueva categoría");
    await dialog.getByLabel("Nombre").fill(category);
    await dialog.getByRole("button", { name: "Crear" }).click();
    await expect(visible(page.getByRole("status"))).toContainText(category);
    await expectFitsOnPhones(page, "/admin/categorias");
  });

  await test.step("movimientos con la descripción y el monto más largos", async () => {
    await open(page, "/egresos");
    await addTransaction(page, { amount: "99999999999,99", description, category });
    await expect(visible(page.getByText("✓ Egreso registrado"))).toBeVisible();
    await openTab(page, "Ingresos");
    await addTransaction(page, { amount: "99999999999,99", description });
    await expect(visible(page.getByText("✓ Ingreso registrado"))).toBeVisible();
  });

  await test.step("las páginas de la persona", async () => {
    for (const path of ["/dashboard", "/ingresos", "/egresos", "/cuenta"]) {
      await open(page, path);
      await expectFitsOnPhones(page, path);
    }
    await open(page, "/egresos");
    await visible(page.getByRole("link", { name: `Editar ${description}` })).click();
    await expect(heading(page, "Editar movimiento")).toBeVisible();
    await expectFitsOnPhones(page, "editar un egreso");
  });

  await test.step("las páginas de administración", async () => {
    for (const path of ["/admin", "/admin/usuarios", "/admin/historial", "/admin/seguridad"]) {
      await open(page, path);
      await expectFitsOnPhones(page, path);
    }
    await open(page, "/admin/usuarios");
    await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
    await expectFitsOnPhones(page, "detalle de una cuenta");
  });
});
