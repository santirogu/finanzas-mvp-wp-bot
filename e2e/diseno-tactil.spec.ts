import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { heading, newAdmin, setUpTwoFactor } from "./admin";
import { monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { e2eDatabaseUrl } from "./database-url";
import { addTransaction, closeToasts, openAccountMenu, openTab, register, test, toast, visible } from "./helpers";

// En las pantallas táctiles todo cabe en la pantalla, aunque los textos sean largos (sin scroll de
// lado), y los campos tienen letra de 16 px o más: con menos, Safari del iPhone y del iPad hace zoom
// al tocarlos y la página queda corrida. Corre en los proyectos "celular" y "tableta"
// (playwright.config.ts), cada uno en sus anchos.

const SCREENS: Record<string, { width: number; height: number }[]> = {
  // El iPhone más angosto que se sigue usando, el iPhone 17 Pro Max y un celular horizontal.
  celular: [
    { width: 375, height: 800 },
    { width: 440, height: 956 },
    { width: 956, height: 440 },
  ],
  // iPad mini y iPad Air vertical, y iPad Air horizontal.
  tableta: [
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ],
};

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
    // En una barra que se desliza de lado (las secciones del admin), la actual se ve entera.
    for (const current of document.querySelectorAll<HTMLElement>('[aria-current="page"]')) {
      let strip = current.parentElement;
      while (strip && !["auto", "scroll"].includes(getComputedStyle(strip).overflowX)) strip = strip.parentElement;
      if (!strip || !current.checkVisibility()) continue;
      const [item, bar] = [current.getBoundingClientRect(), strip.getBoundingClientRect()];
      if (item.left < bar.left - 1 || item.right > bar.right + 1) {
        problems.push(`la sección actual "${current.textContent?.trim()}" queda cortada en su barra`);
      }
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
    // Ningún texto se sale de su caja (un monto que no cabe en su tarjeta, una fecha que no cabe en
    // su columna): la caja cabe en la pantalla, pero el texto no.
    for (const el of document.body.querySelectorAll("*")) {
      const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!ownText || el.matches("input, textarea, select, option") || !el.checkVisibility()) continue;
      if (getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
        problems.push(`"${el.textContent?.trim().slice(0, 30)}" se sale de su caja (${el.scrollWidth} px en ${el.clientWidth} px)`);
      }
    }
    // Las listas de movimientos ("8 movimientos este mes", "Últimos movimientos"): la descripción
    // conserva un ancho que se lee (100 px, unas 14 letras) aunque el monto sea el máximo y los
    // botones de cada fila miden 44 px (lo que recomienda Apple).
    const lists = [...document.querySelectorAll("section")].filter(
      (section) => section.checkVisibility() && /movimientos?\b/i.test(section.querySelector("h2")?.textContent ?? ""),
    );
    for (const item of lists.flatMap((section) => [...section.querySelectorAll("li")])) {
      const description = item.querySelector("p");
      const descriptionWidth = description?.getBoundingClientRect().width ?? 0;
      if (description && descriptionWidth < 100) {
        problems.push(`la descripción "${description.textContent?.slice(0, 30)}" mide ${Math.round(descriptionWidth)} px`);
      }
      for (const button of item.querySelectorAll("a, button")) {
        const rect = button.getBoundingClientRect();
        if (Math.min(rect.width, rect.height) < 44) {
          problems.push(`en la lista, "${button.getAttribute("aria-label")}" mide ${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
        }
      }
    }
    return problems;
  });
}

/** Revisa la página actual en cada pantalla (sin cortar la prueba: así se ven todos los problemas juntos). */
async function expectFitsOnScreens(page: Page, where: string) {
  for (const size of SCREENS[test.info().project.name]) {
    await page.setViewportSize(size);
    // Dos cuadros: lo que reacciona al cambio de tamaño (la barra del admin) ya se acomodó.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect.soft(await layoutProblems(page), `${where} (${size.width} × ${size.height} px)`).toEqual([]);
  }
}

/** Abre una página y espera a que termine de cargar (mientras tanto hay un esqueleto con aria-busy). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
  await expect(visible(page.getByRole("heading", { level: 1 })).first()).toBeVisible();
}

test("en pantallas de menos de 360 px, la categoría y la fecha van una debajo de la otra @tactil", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  const box = async (label: string) => (await visible(page.getByLabel(label)).boundingBox())!;

  // 320 px: el ancho más chico (y el de 1280 px con zoom al 400 %, WCAG 1.4.10).
  await page.setViewportSize({ width: 320, height: 700 });
  const [category, date] = [await box("Categoría"), await box("Fecha")];
  expect(date.y, "la fecha va debajo de la categoría").toBeGreaterThan(category.y + category.height);
  expect(category.width, "a todo el ancho del formulario").toBeGreaterThan(220);
  expect(date.width).toBeCloseTo(category.width, 0);

  // Desde 360 px, lado a lado.
  await page.setViewportSize({ width: 360, height: 700 });
  const [besideCategory, besideDate] = [await box("Categoría"), await box("Fecha")];
  expect(besideDate.y).toBeCloseTo(besideCategory.y, 0);
  expect(besideDate.x).toBeGreaterThan(besideCategory.x + besideCategory.width);
});

test("en pantallas táctiles las páginas caben y los campos no hacen zoom @tactil", async ({ page }) => {
  test.slow();
  const previousMonth = monthParam(shiftMonth(monthOf(todayInTimezone("America/Bogota")), -1));
  const id = String(randomInt(100_000, 999_999));
  // Lo más largo que se puede escribir: categorías de 40 caracteres y descripciones de 140.
  const category = `Suscripciones y servicios digitales ${id}`.slice(0, 40);
  const description = `Pago de la cuota de administración del conjunto residencial ${id} `.repeat(3).slice(0, 140);
  // Un gasto fijo que pasó de $1 al monto máximo: el historial con la diferencia y el porcentaje más largos.
  const fixedDescription = `Cuota del plan de telefonía móvil e internet del hogar ${id} `.repeat(3).slice(0, 140).trim();

  await test.step("páginas públicas", async () => {
    for (const path of ["/login", "/registro", "/privacidad"]) {
      await page.goto(path);
      await expectFitsOnScreens(page, path);
    }
  });

  await newAdmin(page);
  await setUpTwoFactor(page);

  await test.step("una categoría con el nombre más largo", async () => {
    await open(page, "/admin/categorias");
    await visible(page.getByRole("button", { name: "Nueva categoría" })).click();
    const dialog = page.getByRole("dialog");
    await expectFitsOnScreens(page, "ventana de nueva categoría");
    await dialog.getByLabel("Nombre").fill(category);
    await dialog.getByRole("button", { name: "Crear" }).click();
    await expect(toast(page, category)).toBeVisible();
    await expectFitsOnScreens(page, "/admin/categorias");
  });

  await test.step("movimientos con la descripción y el monto más largos", async () => {
    await open(page, "/egresos");
    await addTransaction(page, { amount: "99999999999,99", description, category });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
    await openTab(page, "Ingresos");
    await addTransaction(page, { amount: "99999999999,99", description });
    await expect(toast(page, /^Ingreso registrado$/)).toBeVisible();
    // Uno del mes anterior: el Resumen compara (el balance cambia en el máximo) y la tarjeta del año marca dos meses.
    await openTab(page, "Egresos");
    await addTransaction(page, { amount: "99999999999,99", description, date: `${previousMonth}-28` });
    await expect(toast(page, /^Egreso registrado en /)).toBeVisible();
    await closeToasts(page);
    await addTransaction(page, { amount: "1", description: fixedDescription, category, date: `${previousMonth}-27` });
    await expect(toast(page, /^Egreso registrado en /)).toBeVisible();
    await closeToasts(page);
    await addTransaction(page, { amount: "99999999999,99", description: fixedDescription, category });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
  });

  await test.step("las páginas de la persona", async () => {
    for (const path of ["/dashboard", "/ingresos", "/egresos", "/reportes", "/cuenta", `/dashboard?mes=${previousMonth}`, `/egresos?mes=${previousMonth}`]) {
      await open(page, path);
      await expectFitsOnScreens(page, path);
    }
    // El menú de la cuenta, abierto (con el nombre y la etiqueta Admin).
    await open(page, "/dashboard");
    await openAccountMenu(page);
    await expectFitsOnScreens(page, "menú de la cuenta");
    await page.keyboard.press("Escape");
    // La tarjeta para elegir el mes, abierta, en el Resumen y en una lista.
    for (const path of [`/dashboard?mes=${previousMonth}`, `/egresos?mes=${previousMonth}`]) {
      await open(page, path);
      await visible(page.getByRole("button", { expanded: false }).filter({ hasText: / de \d{4}$/ })).click();
      await expect(visible(page.getByRole("group", { name: "Elegir un mes" }))).toBeVisible();
      await expectFitsOnScreens(page, `tarjeta de meses en ${path}`);
    }
    // Reportes con la tabla mes a mes abierta (los montos máximos, en sus cuatro columnas).
    await open(page, "/reportes");
    await visible(page.getByText("Ver mes a mes")).click();
    // La tabla (desde 640 px) o, en el celular, la lista de los meses.
    await expect(visible(page.locator("details[open] table, details[open] ul"))).toBeVisible();
    await expectFitsOnScreens(page, "Reportes con la tabla mes a mes");
    // La lista de descargas, abierta: cabe aunque el botón esté contra el borde derecho.
    await visible(page.getByRole("button", { name: "Descargar" })).click();
    await expect(visible(page.getByRole("group", { name: "Opciones de descarga" }))).toBeVisible();
    await expectFitsOnScreens(page, "Reportes con la lista de descargas abierta");
    // En 320 px (WCAG 1.4.10) tampoco se sale, ni por la izquierda: con el título partido en dos líneas,
    // el botón bajaba al comienzo y la lista, que se abre hacia la izquierda, quedaba fuera.
    await page.setViewportSize({ width: 320, height: 700 });
    const options = (await visible(page.getByRole("group", { name: "Opciones de descarga" })).boundingBox())!;
    expect(options.x, "la lista de descargas en 320 px").toBeGreaterThanOrEqual(0);
    expect(options.x + options.width, "la lista de descargas en 320 px").toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    // "Agregar un gasto fijo" abierto: el selector, con la descripción más larga, cabe y no hace zoom.
    const fixed = visible(page.getByRole("region", { name: "Gastos fijos" }));
    await fixed.getByRole("button", { name: "Agregar un gasto fijo" }).click();
    await expect(fixed.getByLabel("Egreso", { exact: true })).toBeFocused();
    await expectFitsOnScreens(page, "Reportes con el formulario de gastos fijos abierto");
    // Agregar el que subió de $1 al máximo y abrir su historial, con una nota de 280 caracteres sin espacios.
    await fixed.getByLabel("Egreso", { exact: true }).selectOption(fixedDescription);
    await fixed.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(toast(page, `Se agregó «${fixedDescription}» a los gastos fijos`)).toBeVisible();
    await closeToasts(page);
    await fixed.getByRole("button", { name: `Historial de ${fixedDescription}` }).click();
    // Abierto, la descripción se lee completa: no se corta.
    const name = fixed.getByText(fixedDescription);
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== "ellipsis")).toBe(true);
    await fixed.getByRole("button", { name: /^Agregar nota del cambio/ }).click();
    await fixed.getByLabel(/^Nota del cambio/).fill(`Subió${"x".repeat(275)}`);
    await expectFitsOnScreens(page, "Reportes con la nota de un cambio abierta");
    await fixed.getByRole("button", { name: "Guardar nota" }).click();
    await expect(toast(page, "Se guardó la nota")).toBeVisible();
    await closeToasts(page);
    await expect(fixed.getByText(`“Subió${"x".repeat(275)}”`)).toBeVisible();
    await expectFitsOnScreens(page, "Reportes con el historial de un gasto fijo abierto");
    await open(page, "/egresos");
    await visible(page.getByRole("link", { name: `Editar ${description}` })).click();
    await expect(heading(page, "Editar movimiento")).toBeVisible();
    await expectFitsOnScreens(page, "editar un egreso");
  });

  await test.step("las páginas de administración", async () => {
    // El bot con tokens de Claude de muchos meses (cientos de millones): los totales caben en sus tarjetas.
    const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
    const usage = { model: "claude-haiku-5-5", inputTokens: 123_456_789, outputTokens: 12_345_678 };
    await sql`
      insert into whatsapp_message (id, phone, body, status, intent, processed_at, ai_requested_at)
      values (${`wamid.tactil.${randomUUID()}`}, '573000000001', 'mensaje de prueba', 'processed',
              ${sql.json({ kind: "reply", text: "", usage })}, now(), now())`;
    await sql.end();
    for (const path of ["/admin", "/admin/usuarios", "/admin/historial", "/admin/bot", "/admin/seguridad"]) {
      await open(page, path);
      await expectFitsOnScreens(page, path);
    }
    // La ventana de los topes del bot, con sus dos campos lado a lado (solo se abre: no se envía).
    await open(page, "/admin/bot");
    await visible(page.getByRole("region", { name: "Configuración" })).getByRole("button", { name: "Cambiar los topes por cuenta" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectFitsOnScreens(page, "ventana de los topes del bot");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await open(page, "/admin/usuarios");
    await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
    await expectFitsOnScreens(page, "detalle de una cuenta");
  });
});
