import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { formatMonthName, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { dateInMonth, daysBetween, usualDay, whenLabel } from "../src/modules/reports/upcoming";
import { e2eDatabaseUrl } from "./database-url";
import { closeToasts, openTab, register, test, toast, visible } from "./helpers";

// Los avisos de próximos pagos del Resumen de punta a punta: con gastos fijos pagados los tres meses
// anteriores (cargados en la base: por la app serían decenas de registros), los que tocan en los próximos
// días y los atrasados, "Mostrar más" y "Este pago ya no aplica". Las fechas salen de hoy: lo que se
// espera de cada una lo calculan las funciones de src/modules/reports/upcoming.ts (con sus pruebas).

const today = todayInTimezone("America/Bogota");

/** La fecha `days` días después de hoy (o antes, si es negativo). */
function shiftDay(days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Los pagos de los tres meses anteriores al de `due`, el mismo día del mes (o el último, si el mes es más corto). */
function paymentsFor(due: string) {
  const day = Number(due.slice(8, 10));
  return [3, 2, 1].map((n) => dateInMonth(monthParam(shiftMonth(monthOf(due), -n)), day));
}

/** Lo que el aviso debe decir de un gasto que se pagó en `payments`: su fecha esperada y cuándo es. */
function expected(payments: string[], month: string) {
  const date = dateInMonth(month, usualDay(payments));
  return { date, when: whenLabel(daysBetween(today, date)) };
}

async function addPayments(email: string, payments: { description: string; amount: number; dates: string[]; category?: string }[]) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [{ id }] = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
  for (const { description, amount, dates, category } of payments) {
    // Una categoría global, por su nombre (o ninguna).
    const [found] = category ? await sql<{ id: string }[]>`select id from category where user_id is null and type = 'expense' and name = ${category}` : [];
    for (const date of dates) {
      await sql`insert into transaction (user_id, type, amount, description, occurred_on, category_id)
                values (${id}, 'expense', ${amount}, ${description}, ${date}, ${found?.id ?? null})`;
    }
  }
  await sql.end();
}

const card = (page: Page) => visible(page.getByRole("region", { name: "Próximos pagos" }));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Próximos pagos: los que tocan pronto y los atrasados, Mostrar más y Este pago ya no aplica @principal", async ({ page }) => {
  const { email } = await register(page);
  // El arriendo toca en dos días; seis servicios, mañana; el gimnasio se debía pagar hace cinco días.
  const rentDue = shiftDay(2);
  const gymDue = shiftDay(-5);
  const rent = paymentsFor(rentDue);
  const gym = paymentsFor(gymDue);
  const services = ["Agua", "Gas", "Internet", "Luz", "Celular", "Netflix"].map((name) => ({
    description: name,
    amount: 50000,
    dates: paymentsFor(shiftDay(1)),
  }));
  await addPayments(email, [
    { description: "Arriendo", amount: 1800000, dates: rent },
    { description: "Gimnasio", amount: 120000, dates: gym },
    ...services,
  ]);
  // El gimnasio, agregado a mano: si hace cinco días fue el mes pasado, sus pagos quedan fuera de los
  // últimos cuatro meses en que se detectan solos.
  await openTab(page, "Fijos");
  const fixed = visible(page.getByRole("region", { name: "Gastos fijos" }));
  if (!(await fixed.getByRole("button", { name: /^Historial de Gimnasio/ }).count())) {
    await fixed.getByRole("button", { name: "Agregar un gasto fijo" }).click();
    await fixed.getByLabel("Egreso", { exact: true }).selectOption("Gimnasio");
    await fixed.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(toast(page, "Se agregó “Gimnasio” a los gastos fijos")).toBeVisible();
    await closeToasts(page);
  }
  await openTab(page, "Resumen");

  await test.step("el atrasado primero, en rojo; después el arriendo y los servicios, con su fecha y su monto", async () => {
    const items = card(page).getByRole("listitem");
    await expect(items).toHaveCount(5);
    const gymExpected = expected(gym, gymDue.slice(0, 7));
    await expect(items.first()).toContainText("Gimnasio");
    await expect(items.first().getByText(gymExpected.when, { exact: true })).toHaveClass(/text-danger/);
    await expect(items.first()).toContainText("≈ −$120.000,00");
    const rentItem = card(page).getByRole("listitem").filter({ hasText: "Arriendo" });
    const rentExpected = expected(rent, rentDue.slice(0, 7));
    // El arriendo va después de los servicios (mañana): con "Mostrar más" se ve.
    await card(page).getByRole("button", { name: "Mostrar 3 más" }).click();
    await expect(items).toHaveCount(8);
    await expect(rentItem).toContainText(`lo sueles pagar el ${usualDay(rent)}`);
    await expect(rentItem).toContainText("≈ −$1.800.000,00");
    await expect(rentItem.getByText(rentExpected.when, { exact: true })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await card(page).getByRole("button", { name: "Mostrar menos" }).click();
    await expect(items).toHaveCount(5);
  });

  await test.step("Este pago ya no aplica: el del gimnasio de ese mes ya no se muestra, tampoco al volver", async () => {
    const month = formatMonthName(monthOf(gymDue), { withYear: gymDue.slice(0, 4) !== today.slice(0, 4) });
    await card(page).getByRole("button", { name: `Este pago ya no aplica: Gimnasio, ${month}` }).click();
    await expect(toast(page, `No se avisará del pago de ${formatMonthName(monthOf(gymDue))} de “Gimnasio”`)).toHaveAttribute("data-tone", "removal");
    await expect(card(page).getByRole("listitem").filter({ hasText: "Gimnasio" })).toHaveCount(0);
    await page.reload();
    await expect(card(page).getByRole("listitem").filter({ hasText: "Gimnasio" })).toHaveCount(0);
    await expect(card(page).getByRole("button", { name: "Mostrar 2 más" })).toBeVisible();
  });

  await test.step("Ver gastos fijos lleva a Fijos; en el Resumen de otro mes no hay avisos", async () => {
    await card(page).getByRole("link", { name: "Ver gastos fijos" }).click();
    await expect(page).toHaveURL(/\/gastos-fijos$/);
    await page.goto(`/dashboard?mes=${monthParam(shiftMonth(monthOf(today), -1))}`);
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});

test("sin gastos fijos, el Resumen no muestra la tarjeta", async ({ page }) => {
  await register(page);
  await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("los avisos se leen bien en modo oscuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { email } = await register(page);
  await addPayments(email, [
    { description: "Arriendo", amount: 1800000, dates: paymentsFor(shiftDay(1)) },
    { description: "Gimnasio", amount: 120000, dates: paymentsFor(shiftDay(-3)) },
  ]);
  await page.reload();
  await expect(card(page).getByRole("listitem").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("Configuración → Notificaciones: los días de anticipación cambian lo que avisa el Resumen; apagados, nada", async ({ page }) => {
  const { email } = await register(page);
  // Toca en 6 días: con los 3 de siempre todavía no avisa.
  const due = shiftDay(6);
  const rent = paymentsFor(due);
  await addPayments(email, [{ description: "Arriendo", amount: 1800000, dates: rent }]);
  const { when } = expected(rent, due.slice(0, 7));
  await page.reload();
  await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  const settings = () => visible(page.getByRole("region", { name: "Notificaciones" }));
  const days = () => settings().getByLabel("Días de anticipación");

  await test.step("un número fuera de rango no se guarda: lo dice debajo del campo", async () => {
    await page.goto("/configuracion");
    await expect(settings().getByRole("switch", { name: /Avisos de próximos pagos/ })).toBeChecked();
    await expect(days()).toHaveValue("3");
    await days().fill("11");
    await settings().getByRole("button", { name: "Guardar" }).click();
    await expect(settings().getByText("Escribe un número entre 0 y 10.")).toBeVisible();
    await expect(days()).toHaveAttribute("aria-invalid", "true");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("con 10 días, el Resumen avisa del arriendo", async () => {
    await days().fill("10");
    await settings().getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se guardó: te avisaremos 10 días antes de cada pago fijo")).toHaveAttribute("data-tone", "success");
    await closeToasts(page);
    await openTab(page, "Resumen");
    await expect(card(page)).toContainText("Tus gastos fijos de los próximos 10 días y los que todavía no registras.");
    await expect(card(page).getByRole("listitem").filter({ hasText: "Arriendo" }).getByText(when, { exact: true })).toBeVisible();
  });

  await test.step("apagados: el interruptor queda apagado al guardar, sin tarjeta, y al volver siguen apagados con sus días", async () => {
    await page.goto("/configuracion");
    await settings().getByText("Avisos de próximos pagos", { exact: true }).click();
    await expect(days()).toBeDisabled();
    await settings().getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se apagaron los avisos de próximos pagos")).toHaveAttribute("data-tone", "removal");
    // React vacía el formulario al terminar de guardar (el botón vuelve a "Guardar"): el interruptor tiene que
    // seguir apagado, como dice el texto.
    await expect(settings().getByRole("button", { name: "Guardar" })).toBeEnabled();
    await expect(settings().getByRole("switch", { name: /Avisos de próximos pagos/ })).not.toBeChecked();
    await expect(settings().getByText("Apagados", { exact: true })).toBeVisible();
    await expect(days()).toBeDisabled();
    await page.reload();
    await expect(settings().getByRole("switch", { name: /Avisos de próximos pagos/ })).not.toBeChecked();
    await expect(days()).toHaveValue("10");
    await openTab(page, "Resumen");
    await expect(card(page)).toHaveCount(0);
  });
});

test("Registrar pago desde el aviso: con el monto y la fecha que se confirman, y la categoría del último pago", async ({ page }) => {
  const { email } = await register(page);
  await addPayments(email, [{ description: "Gimnasio", amount: 120000, dates: paymentsFor(shiftDay(-5)), category: "Salud" }]);
  await page.reload();
  const gym = card(page).getByRole("listitem").filter({ hasText: "Gimnasio" });
  const opener = gym.getByRole("button", { name: "Registrar pago de Gimnasio" });
  const dialog = page.getByRole("dialog", { name: "Registrar pago de Gimnasio" });

  await test.step("la ventana: la categoría del último pago, su monto y la fecha de hoy; Esc la cierra y el foco vuelve", async () => {
    await opener.click();
    await expect(dialog).toHaveAccessibleDescription(/^Categoría: .*Salud · como el último pago\.$/);
    await expect(dialog.getByLabel("Monto")).toHaveValue("120.000,00");
    await expect(dialog.getByLabel("Monto")).toBeFocused();
    await expect(dialog.getByLabel("Fecha")).toHaveValue(today);
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  await test.step("con otro monto: se registra, el aviso desaparece y el pago está en Egresos", async () => {
    await opener.click();
    await dialog.getByLabel("Monto").fill("125000");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(toast(page, "Se registró el pago de “Gimnasio”: −$125.000,00")).toHaveAttribute("data-tone", "success");
    await expect(dialog).toBeHidden();
    await expect(card(page)).toHaveCount(0);
    await closeToasts(page);
    await openTab(page, "Egresos");
    // En la lista del mes: el de hoy (los anteriores son de otros meses).
    const row = visible(page.getByRole("listitem").filter({ hasText: "Gimnasio" }));
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("−$125.000,00");
    await expect(row).toContainText("Salud");
  });
});

test("La campana: desde cualquier página, el número, Marcar como leída (sigue en el Resumen) y Registrar pago", async ({ page }) => {
  const { email } = await register(page);
  await addPayments(email, [
    { description: "Gimnasio", amount: 120000, dates: paymentsFor(shiftDay(-5)), category: "Salud" },
    { description: "Netflix", amount: 44900, dates: paymentsFor(shiftDay(2)), category: "Entretenimiento" },
  ]);
  // La campana está en el encabezado, que no se vuelve a dibujar al cambiar de pestaña: se ve lo cargado
  // en la base al recargar (en la app, cada acción llama a refresh() y la actualiza).
  await page.reload();
  await openTab(page, "Egresos");
  const bell = visible(page.getByRole("button", { name: /^Notificaciones/ }));
  const panel = visible(page.getByRole("group", { name: "Notificaciones" }));

  await test.step("en Egresos, la campana dice 2 sin leer; abierta, los dos avisos (y sin problemas de accesibilidad)", async () => {
    await expect(bell).toHaveAccessibleName("Notificaciones: 2 sin leer");
    await bell.click();
    await expect(panel.getByRole("listitem")).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(bell).toBeFocused();
  });

  await test.step("Marcar como leída el gimnasio: sale de la campana, pero sigue en el Resumen", async () => {
    await bell.click();
    const month = formatMonthName(monthOf(shiftDay(-5)), { withYear: shiftDay(-5).slice(0, 4) !== today.slice(0, 4) });
    await panel.getByRole("button", { name: `Marcar como leída: Gimnasio, ${month}` }).click();
    await expect(toast(page, "Se marcó como leída")).toHaveAttribute("data-tone", "success");
    await expect(bell).toHaveAccessibleName("Notificaciones: 1 sin leer");
    await closeToasts(page);
    await openTab(page, "Resumen");
    await expect(card(page).getByRole("listitem").filter({ hasText: "Gimnasio" })).toHaveCount(1);
  });

  await test.step("Registrar el pago de Netflix desde la campana: sin notificaciones, y tampoco en el Resumen", async () => {
    await bell.click();
    await panel.getByRole("button", { name: "Registrar pago de Netflix" }).click();
    const dialog = page.getByRole("dialog", { name: "Registrar pago de Netflix" });
    await expect(dialog.getByLabel("Monto")).toHaveValue("44.900,00");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(toast(page, "Se registró el pago de “Netflix”: −$44.900,00")).toBeVisible();
    await expect(bell).toHaveAccessibleName("Notificaciones");
    await expect(card(page).getByRole("listitem").filter({ hasText: "Netflix" })).toHaveCount(0);
  });

  await test.step("con los avisos apagados, no hay campana", async () => {
    await closeToasts(page);
    await page.goto("/configuracion");
    const settings = visible(page.getByRole("region", { name: "Notificaciones" }));
    await settings.getByText("Avisos de próximos pagos", { exact: true }).click();
    await settings.getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se apagaron los avisos de próximos pagos")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Notificaciones/ })).toHaveCount(0);
  });
});
