import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { formatMonthLabel, formatMonthName, formatShortDate, type Month, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { e2eDatabaseUrl } from "./database-url";
import { addTransaction, closeToasts, openTab, register, test, toast, visible } from "./helpers";

// Reportes de punta a punta: con los movimientos de cuatro meses, las cifras del período, el gráfico
// (que lleva al Resumen de cada mes), las categorías frente a su promedio, los gastos fijos y el
// cambio de período.

const current = monthOf(todayInTimezone("America/Bogota"));
const [m1, m2, m3] = [1, 2, 3].map((n) => shiftMonth(current, -n));
const dayOf = (month: Month, day: number) => `${monthParam(month)}-${String(day).padStart(2, "0")}`;
const name = (month: Month) => formatMonthName(month);

type Movement = Parameters<typeof addTransaction>[1];

/** Registra un movimiento desde la pestaña actual y espera su aviso (de otro mes, dice en cuál quedó). */
async function add(page: Page, kind: "Ingreso" | "Egreso", movement: Movement, month?: Month) {
  await addTransaction(page, movement);
  await expect(toast(page, month ? `${kind} registrado en ${formatMonthName(month, { withYear: true })}` : new RegExp(`^${kind} registrado$`))).toBeVisible();
  // Así el aviso del siguiente, aunque diga lo mismo, es otro.
  await closeToasts(page);
}

const section = (page: Page, title: string) => visible(page.getByRole("region", { name: title }));
const stat = (page: Page, label: string) =>
  visible(page.getByRole("region", { name: "Resumen del período" }).locator(".card").filter({ has: page.getByText(label, { exact: true }) }));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Reportes: las cifras del período, el gráfico, las categorías y los gastos fijos @principal", async ({ page }) => {
  await register(page);

  await test.step("cuatro meses de movimientos", async () => {
    await openTab(page, "Ingresos");
    await add(page, "Ingreso", { amount: "4000000", description: "Salario", category: "Salario", date: dayOf(m1, 15) }, m1);
    await add(page, "Ingreso", { amount: "4000000", description: "Salario", category: "Salario" });
    await openTab(page, "Egresos");
    for (const month of [m3, m2, m1]) {
      await add(page, "Egreso", { amount: "1800000", description: "Arriendo", category: "Vivienda", date: dayOf(month, 5) }, month);
    }
    await add(page, "Egreso", { amount: "100000", description: "Restaurante con amigos", category: "Alimentación", date: dayOf(m1, 10) }, m1);
    // El de este mes, escrito distinto: es el mismo gasto fijo.
    await add(page, "Egreso", { amount: "1800000", description: "arriendo ", category: "Vivienda" });
  });

  await test.step("las cifras de los últimos 12 meses", async () => {
    await openTab(page, "Reportes");
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(visible(page.getByRole("link", { name: "Últimos 12 meses" }))).toHaveAttribute("aria-current", "page");
    const range = `De ${formatMonthName(shiftMonth(current, -11), { withYear: true })} a ${formatMonthName(current, { withYear: true })}`;
    await expect(visible(page.getByText(range))).toBeVisible();

    await expect(stat(page, "Ingresos")).toContainText("$8.000.000,00");
    await expect(stat(page, "Egresos")).toContainText("$7.300.000,00");
    await expect(stat(page, "Balance del período")).toContainText("$700.000,00");
    await expect(stat(page, "Balance del período")).toContainText("Ahorraste el 9% de tus ingresos");
    // Los tres meses completos (el actual va en curso): (1.800.000 + 1.800.000 + 1.900.000) / 3.
    await expect(stat(page, "Gasto promedio por mes")).toContainText("$1.833.333,33");
    await expect(stat(page, "Gasto promedio por mes")).toContainText(`En 3 meses, sin ${name(current)} (va en curso)`);
    await expect(stat(page, "El mes de más gasto")).toContainText(formatMonthLabel(m1));
    await expect(stat(page, "El mes de más gasto")).toContainText("$1.900.000,00");
  });

  await test.step("cada categoría, frente a su promedio", async () => {
    const categories = section(page, "Gastos por categoría");
    await expect(categories).toContainText(`cómo te fue en ${name(m1)} frente a su promedio de ${name(m3)} y ${name(m2)}`);
    const rows = categories.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Vivienda");
    await expect(rows.nth(0)).toContainText("$7.200.000,00 · 99%");
    await expect(rows.nth(0)).toContainText(`En ${name(m1)}, igual que su promedio`);
    await expect(rows.nth(1)).toContainText("Alimentación");
    await expect(rows.nth(1)).toContainText(`Nueva en ${name(m1)}`);
  });

  await test.step("el arriendo es un gasto fijo (escrito como la última vez)", async () => {
    const fixed = section(page, "Gastos fijos");
    const items = fixed.getByRole("listitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("arriendo");
    await expect(items.first()).toContainText("En 4 de 12 meses");
    await expect(items.first()).toContainText("−$1.800.000,00");
    await expect(fixed).toContainText("Total al mes−$1.800.000,00");
    await expect(fixed).toContainText("Son el 98% de tu gasto promedio por mes.");
  });

  await test.step("descargar los movimientos del período en CSV (el PDF dice Pronto), para Excel", async () => {
    await visible(page.getByRole("button", { name: "Descargar" })).click();
    const options = visible(page.getByRole("group", { name: "Opciones de descarga" }));
    await expect(options.getByText("Reporte (PDF)").locator("..")).toHaveAttribute("aria-disabled", "true");
    const [download] = await Promise.all([page.waitForEvent("download"), options.getByRole("link", { name: /Movimientos \(CSV\)/ }).click()]);
    await expect(options).toBeHidden();
    expect(download.suggestedFilename()).toBe(`movimientos-${monthParam(shiftMonth(current, -11))}-a-${monthParam(current)}.csv`);
    const content = readFileSync(await download.path(), "utf8");
    // Con el BOM (Excel lee bien las tildes), ";" y la coma de los centavos.
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const lines = content.slice(1).split("\r\n");
    expect(lines[0]).toBe("Fecha;Tipo;Descripción;Categoría;Monto;Origen");
    expect(lines).toContain(`${dayOf(m1, 10)};Egreso;Restaurante con amigos;Alimentación;-100000,00;Web`);
    expect(lines).toContain(`${dayOf(m1, 15)};Ingreso;Salario;Salario;4000000,00;Web`);
    // Los 7 movimientos (2 ingresos y 5 egresos), el encabezado y la línea vacía del final.
    expect(lines).toHaveLength(9);
  });

  await test.step("los gastos más grandes, sin el arriendo (es fijo); tocar uno lleva a editarlo", async () => {
    const biggest = section(page, "Los gastos más grandes");
    const items = biggest.getByRole("listitem");
    await expect(items).toHaveCount(1);
    const date = formatShortDate(dayOf(m1, 10), { withYear: m1.year !== current.year });
    await expect(items.first()).toContainText(`Restaurante con amigos${date} · Alimentación−$100.000,00`);
    await items.first().getByRole("link", { name: /^Editar .*Restaurante con amigos/ }).click();
    await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
    await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Restaurante con amigos");
    await page.goBack();
    await expect(page).toHaveURL(/\/reportes$/);
    await expect(section(page, "Los gastos más grandes")).toBeVisible();
  });

  await test.step("los gastos fijos a mano: quitar, volver a poner, agregar y sacar", async () => {
    const fixed = section(page, "Gastos fijos");
    const biggest = section(page, "Los gastos más grandes");
    // Quitar el arriendo (detectado): pasa a "Quitados" y ahora está entre los más grandes.
    await fixed.getByRole("button", { name: "Quitar arriendo de los gastos fijos" }).click();
    await expect(toast(page, "Se quitó «arriendo» de los gastos fijos")).toHaveAttribute("data-tone", "removal");
    await expect(fixed).toContainText("Todavía no hay egresos que se repitan cada mes.");
    await expect(biggest).toContainText("arriendo");
    await fixed.getByText("Quitados (1)").click();
    await fixed.getByRole("button", { name: "Volver a poner arriendo en los gastos fijos" }).click();
    await expect(toast(page, "Volvió «arriendo» a los gastos fijos")).toHaveAttribute("data-tone", "success");
    await expect(fixed.getByRole("listitem")).toHaveCount(1);
    await closeToasts(page);

    // Agregar el restaurante (lleva un solo mes): queda "Agregado por ti" y sale de los más grandes.
    await fixed.getByRole("button", { name: "Agregar un gasto fijo" }).click();
    const select = fixed.getByLabel("Egreso", { exact: true });
    await expect(select).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await select.selectOption({ label: "🍽️ Restaurante con amigos" });
    await fixed.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(toast(page, "Se agregó «Restaurante con amigos» a los gastos fijos")).toHaveAttribute("data-tone", "success");
    await expect(fixed.getByRole("listitem").filter({ hasText: "Restaurante con amigos" })).toContainText("Agregado por ti");
    await expect(biggest).toContainText("Todos los egresos del período son gastos fijos.");
    await closeToasts(page);

    // Sacarlo: vuelve a ser un gasto más (sin pasar por "Quitados").
    await fixed.getByRole("button", { name: "Quitar Restaurante con amigos de los gastos fijos" }).click();
    await expect(toast(page, "Se quitó «Restaurante con amigos» de los gastos fijos")).toBeVisible();
    await expect(fixed.getByRole("listitem")).toHaveCount(1);
    await expect(fixed.getByText(/^Quitados/)).toHaveCount(0);
    await expect(biggest).toContainText("Restaurante con amigos");
    await closeToasts(page);
  });

  await test.step("la tabla mes a mes y, al tocar un mes del gráfico, su Resumen", async () => {
    const byMonth = section(page, "Ingresos y egresos por mes");
    await byMonth.getByText("Ver mes a mes").click();
    // Una fila de la tabla (desde 640 px) o, en el celular, el mes con sus montos debajo.
    const row = visible(byMonth.locator("tr, li").filter({ hasText: formatMonthLabel(m1) }));
    await expect(row).toContainText("$4.000.000,00");
    await expect(row).toContainText("$1.900.000,00");
    await expect(row).toContainText("$2.100.000,00");

    const bar = byMonth.getByRole("link", {
      name: `${formatMonthLabel(m1)}: ingresos $4.000.000,00, egresos $1.900.000,00, balance $2.100.000,00`,
    });
    await bar.hover();
    await expect(byMonth).toContainText(`${formatMonthLabel(m1)} · Ingresos $4.000.000,00 · Egresos $1.900.000,00`);
    await bar.click();
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?mes=${monthParam(m1)}$`));
    await expect(visible(page.getByRole("button", { name: formatMonthLabel(m1), exact: true }))).toBeVisible();
    // Desde ahí, la pestaña Reportes vuelve a los 12 meses (no lleva el mes).
    await openTab(page, "Reportes");
    await expect(page).toHaveURL(/\/reportes$/);
  });

  await test.step("otro período: el año en curso", async () => {
    const year = visible(page.getByRole("navigation", { name: "Período" }).getByRole("link", { name: String(current.year), exact: true }));
    await year.click();
    await expect(page).toHaveURL(new RegExp(`/reportes\\?periodo=${current.year}$`));
    await expect(year).toHaveAttribute("aria-current", "page");
    const range = current.month === 1 ? formatMonthLabel(current) : `De enero a ${formatMonthName(current, { withYear: true })}`;
    await expect(visible(page.getByText(range, { exact: true }))).toBeVisible();
  });
});

test("el historial de un gasto fijo: cada cambio de valor, con su nota", async ({ page }) => {
  const today = todayInTimezone("America/Bogota");
  const date = formatShortDate(today, { withYear: true });
  await register(page);
  await openTab(page, "Egresos");
  for (const month of [m2, m1]) {
    await add(page, "Egreso", { amount: "250000", description: "Plan del celular", category: "Servicios", date: dayOf(month, 8) }, month);
  }
  await add(page, "Egreso", { amount: "270000", description: "Plan del celular", category: "Servicios" });
  await openTab(page, "Reportes");
  const fixed = section(page, "Gastos fijos");
  const history = fixed.getByRole("button", { name: /^Historial de Plan del celular/ });

  await test.step("cerrado dice su último cambio; al tocarlo, el cambio y el primer pago", async () => {
    await expect(history).toHaveAttribute("aria-expanded", "false");
    await expect(history).toContainText(`8% desde ${name(current)}`);
    await history.click();
    await expect(history).toHaveAttribute("aria-expanded", "true");
    const entries = fixed.locator(`[id="${await history.getAttribute("aria-controls")}"]`).getByRole("listitem");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText(`${date}+$20.000,00 (+8%)$250.000,00 → $270.000,00`);
    await expect(entries.nth(1)).toContainText(`${formatShortDate(dayOf(m2, 8), { withYear: true })}Primer pago$250.000,00`);
  });

  await test.step("agregarle una nota", async () => {
    await fixed.getByRole("button", { name: `Agregar nota del cambio del ${date}` }).click();
    const field = fixed.getByLabel(`Nota del cambio del ${date}`);
    await expect(field).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await field.fill("Subió la tarifa del plan");
    await fixed.getByRole("button", { name: "Guardar nota" }).click();
    await expect(toast(page, "Se guardó la nota")).toHaveAttribute("data-tone", "success");
    await expect(fixed.getByText("“Subió la tarifa del plan”")).toBeVisible();
    // Sin el aviso: mientras aparece (con su animación), axe lo mide a medio camino. Su contraste lo
    // revisa src/color-contrast.test.ts.
    await closeToasts(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("se queda al volver; editarla y borrarla", async () => {
    await page.reload();
    await history.click();
    await expect(fixed.getByText("“Subió la tarifa del plan”")).toBeVisible();
    await fixed.getByRole("button", { name: `Editar nota del cambio del ${date}` }).click();
    const field = fixed.getByLabel(`Nota del cambio del ${date}`);
    await expect(field).toHaveValue("Subió la tarifa del plan");
    await field.fill("Subió la tarifa: pasé al plan con más datos");
    await fixed.getByRole("button", { name: "Guardar nota" }).click();
    await expect(toast(page, "Se guardó la nota")).toBeVisible();
    await expect(fixed.getByText("“Subió la tarifa: pasé al plan con más datos”")).toBeVisible();
    await closeToasts(page);

    await fixed.getByRole("button", { name: `Editar nota del cambio del ${date}` }).click();
    await fixed.getByRole("button", { name: "Borrar nota" }).click();
    await expect(toast(page, "Se borró la nota")).toHaveAttribute("data-tone", "removal");
    await expect(fixed.getByText(/^“/)).toHaveCount(0);
    await expect(fixed.getByRole("button", { name: `Agregar nota del cambio del ${date}` })).toBeVisible();
  });
});

test("¿Qué días gastas más?: el calendario de un mes (sin los fijos), el detalle de un día y los promedios", async ({ page }) => {
  const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const weekdayOn = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  await register(page);
  await openTab(page, "Egresos");
  // El arriendo es fijo (tres de los últimos cuatro meses): no cuenta en el calendario.
  for (const month of [m3, m2, m1]) {
    await add(page, "Egreso", { amount: "1800000", description: "Arriendo", category: "Vivienda", date: dayOf(month, 5) }, month);
  }
  await add(page, "Egreso", { amount: "100000", description: "Restaurante con amigos", category: "Alimentación", date: dayOf(m1, 10) }, m1);
  await add(page, "Egreso", { amount: "20000", description: "Taxi", category: "Transporte", date: dayOf(m1, 10) }, m1);
  await add(page, "Egreso", { amount: "30000", description: "Cine", category: "Entretenimiento", date: dayOf(m1, 20) }, m1);
  await openTab(page, "Reportes");
  const daily = section(page, "¿Qué días gastas más?");
  const dayButton = (date: string) =>
    daily.getByRole("button", { name: new RegExp(`^${weekdayOn(date)} ${Number(date.slice(8))} de ${name(m1)}:`) });

  await test.step("empieza en el mes actual; la flecha lleva al anterior, en la dirección", async () => {
    await expect(daily.getByRole("heading", { level: 3, name: formatMonthLabel(current) })).toBeVisible();
    await expect(daily.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute("aria-disabled", "true");
    await daily.getByRole("link", { name: `Mes anterior: ${formatMonthName(m1, { withYear: true })}` }).click();
    await expect(page).toHaveURL(new RegExp(`/reportes\\?calendario=${monthParam(m1)}$`));
    await expect(daily.getByRole("heading", { level: 3, name: formatMonthLabel(m1) })).toBeVisible();
  });

  await test.step("se abre en el día de más gasto, con sus egresos; el del arriendo, sin egresos", async () => {
    const tenth = dayOf(m1, 10);
    await expect(dayButton(tenth)).toHaveAttribute("aria-pressed", "true");
    await expect(dayButton(tenth)).toHaveAccessibleName(`${weekdayOn(tenth)} 10 de ${name(m1)}: $120.000,00 en 2 egresos`);
    const detail = daily.getByRole("heading", { level: 4 });
    await expect(detail).toHaveText(`${capitalized(weekdayOn(tenth))} ${formatShortDate(tenth)}`);
    await expect(daily).toContainText("−$120.000,00");
    await expect(daily.getByRole("link", { name: /^Editar / })).toHaveCount(2);
    await expect(dayButton(dayOf(m1, 5))).toHaveAccessibleName(`${weekdayOn(dayOf(m1, 5))} 5 de ${name(m1)}: sin egresos`);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("al tocar otro día, su detalle; tocar un egreso lleva a editarlo y atrás vuelve al mismo mes", async () => {
    await dayButton(dayOf(m1, 20)).click();
    await expect(dayButton(dayOf(m1, 20))).toHaveAttribute("aria-pressed", "true");
    await daily.getByRole("link", { name: /^Editar .*Cine/ }).click();
    await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
    await expect(visible(page.getByLabel("Descripción"))).toHaveValue("Cine");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`calendario=${monthParam(m1)}$`));
    await expect(section(page, "¿Qué días gastas más?").getByRole("heading", { level: 3, name: formatMonthLabel(m1) })).toBeVisible();
  });

  await test.step("el día de la semana de más gasto y las quincenas, sin el arriendo", async () => {
    await expect(daily).toContainText(`Gastas más los ${weekdayOn(dayOf(m1, 10))}`);
    await expect(daily.getByText("Del 1 al 15: 80%")).toBeVisible();
    await expect(daily.getByText("Del 16 al fin de mes: 20%")).toBeVisible();
  });
});

test("con más de 10 gastos, los demás se abren con «Ver los N siguientes»", async ({ page }) => {
  const { email } = await register(page);
  // 13 egresos distintos de hoy, cargados en la base de las E2E (por la app serían 13 registros).
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  for (let i = 1; i <= 13; i++) {
    await sql`insert into transaction (user_id, type, amount, description, occurred_on)
              values (${id}, 'expense', ${i * 1000}, ${`Gasto número ${i}`}, ${todayInTimezone("America/Bogota")})`;
  }
  await sql.end();

  await openTab(page, "Reportes");
  const biggest = section(page, "Los gastos más grandes");
  const links = biggest.getByRole("link", { name: /^Editar / });
  await expect(visible(links)).toHaveCount(10);
  await expect(visible(links).first()).toContainText("Gasto número 13");
  await biggest.getByText("Ver los 3 siguientes").click();
  await expect(visible(links)).toHaveCount(13);
  await expect(visible(links).last()).toContainText("Gasto número 1");
  await expect(visible(links).last()).toContainText("Sin categoría");
});

test("Reportes sin movimientos lo explica", async ({ page }) => {
  await register(page);
  await openTab(page, "Reportes");
  await expect(visible(page.getByText("Aún no tienes movimientos."))).toBeVisible();
  // Sin movimientos no hay nada que descargar.
  await expect(visible(page.getByRole("button", { name: "Descargar" }))).toHaveCount(0);
  await expect(visible(page.getByRole("navigation", { name: "Período" }).getByRole("link"))).toHaveCount(1);
  await expect(visible(page.getByRole("region", { name: "Gastos fijos" }))).toHaveCount(0);
});

test("un período mal escrito o futuro en la URL muestra los últimos 12 meses", async ({ page }) => {
  await register(page);
  for (const periodo of ["2999", "septiembre", "1999"]) {
    await page.goto(`/reportes?periodo=${periodo}`);
    await expect(visible(page.getByRole("link", { name: "Últimos 12 meses" }))).toHaveAttribute("aria-current", "page");
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Reportes con datos y la tabla abierta, sin problemas de accesibilidad en modo ${colorScheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await register(page);
    await openTab(page, "Egresos");
    for (const month of [m2, m1]) {
      await add(page, "Egreso", { amount: "250000", description: "Plan del celular", category: "Servicios", date: dayOf(month, 8) }, month);
    }
    await add(page, "Egreso", { amount: "250000", description: "Plan del celular", category: "Servicios" });
    // Uno que no es fijo: el calendario de "¿Qué días gastas más?" tiene un día con gastos, elegido.
    await add(page, "Egreso", { amount: "45000", description: "Cine", category: "Entretenimiento" });
    await openTab(page, "Reportes");
    await expect(visible(page.getByRole("region", { name: "Gastos fijos" }).getByRole("listitem"))).toHaveCount(1);
    await expect(visible(page.getByRole("region", { name: "¿Qué días gastas más?" }).getByRole("button", { pressed: true }))).toBeVisible();
    // Con el historial del gasto fijo abierto.
    await visible(page.getByRole("button", { name: /^Historial de Plan del celular/ })).click();
    await visible(page.getByText("Ver mes a mes")).click();
    // Con el mouse en un mes: el detalle de abajo, en sus colores.
    await visible(page.getByRole("link", { name: new RegExp(`^${formatMonthLabel(m1)}:`) })).hover();
    expect(await seriousViolations(page)).toEqual([]);
    // Y con la lista de descargas abierta (el "Pronto" del PDF, apagado, también se lee).
    await visible(page.getByRole("button", { name: "Descargar" })).click();
    await expect(visible(page.getByRole("group", { name: "Opciones de descarga" }))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
}
