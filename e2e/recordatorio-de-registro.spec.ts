import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seriousViolations } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { addTransaction, closeToasts, openTab, register, test, toast, visible } from "./helpers";

// El recordatorio de registro de punta a punta: una cuenta que lleva días sin registrar nada lo ve en el Resumen y
// en la campana; elige después de cuántos días en Configuración, y registrar un movimiento lo quita. Los días sin
// registrar se simulan moviendo hacia atrás la fecha en que se creó la cuenta (en la base de las E2E).

async function accountCreatedDaysAgo(email: string, days: number) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`update "user" set created_at = now() - make_interval(days => ${days}) where email = ${email}`;
  await sql.end();
}

const reminderCard = (page: Page) => visible(page.getByRole("region", { name: /sin registrar nada|no registras ningún movimiento/ }));
const settings = (page: Page) => visible(page.getByRole("region", { name: "Recordatorio de registro" }));

test("el recordatorio de registro: en el Resumen y la campana, con los días de Configuración, hasta registrar algo @principal", async ({ page }) => {
  const { email } = await register(page);
  // Dos días sin registrar nada: con los 3 de siempre, todavía no toca.
  await accountCreatedDaysAgo(email, 2);
  const bell = visible(page.getByRole("button", { name: /^Notificaciones/ }));
  const panel = visible(page.getByRole("group", { name: "Notificaciones" }));

  await test.step("con 3 días (los de siempre), todavía no hay recordatorio", async () => {
    await page.reload();
    await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(reminderCard(page)).toHaveCount(0);
    await expect(bell).toHaveAccessibleName("Notificaciones");
  });

  await test.step("en Configuración: fuera de rango no se guarda; con 2 días, sí", async () => {
    await page.goto("/configuracion");
    await visible(page.getByRole("navigation", { name: "En esta página" })).getByRole("link", { name: "Recordatorio" }).click();
    await expect(settings(page)).toBeInViewport();
    await expect(settings(page).getByRole("switch", { name: /Recordatorio/ })).toBeChecked();
    const days = settings(page).getByLabel("Días sin registrar");
    await expect(days).toHaveValue("3");
    await days.fill("15");
    await settings(page).getByRole("button", { name: "Guardar" }).click();
    await expect(settings(page).getByText("Escribe un número de días de 1 a 14.")).toBeVisible();
    await expect(days).toHaveAttribute("aria-invalid", "true");
    expect(await seriousViolations(page)).toEqual([]);
    await days.fill("2");
    await settings(page).getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se guardó: te lo recordaremos si pasan 2 días sin registrar nada")).toHaveAttribute("data-tone", "success");
    await closeToasts(page);
  });

  await test.step("el Resumen lo dice, con el enlace para registrar (y sin problemas de accesibilidad)", async () => {
    await openTab(page, "Resumen");
    await expect(reminderCard(page)).toContainText("Todavía no registras ningún movimiento.");
    await expect(reminderCard(page)).toContainText("Registra lo que te falte para que tus cuentas del mes queden completas.");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("la campana también; Marcar como leída lo saca de la campana, pero sigue en el Resumen", async () => {
    // La campana está en el encabezado: se ve lo guardado al recargar.
    await page.reload();
    await expect(bell).toHaveAccessibleName("Notificaciones: 1 sin leer");
    await bell.click();
    await expect(panel.getByText("Todavía no registras ningún movimiento.")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await panel.getByRole("button", { name: "Marcar como leída: el recordatorio de registro" }).click();
    await expect(toast(page, "Se marcó como leída")).toHaveAttribute("data-tone", "success");
    await expect(bell).toHaveAccessibleName("Notificaciones");
    await expect(reminderCard(page)).toBeVisible();
    await closeToasts(page);
  });

  await test.step("registrar un egreso desde la tarjeta lo quita", async () => {
    await reminderCard(page).getByRole("link", { name: "Registrar un egreso" }).click();
    await expect(page).toHaveURL(/\/egresos$/);
    await addTransaction(page, { amount: "18000", description: "Almuerzo" });
    await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
    await openTab(page, "Resumen");
    await expect(visible(page.getByRole("main").getByText("Almuerzo"))).toBeVisible();
    await expect(reminderCard(page)).toHaveCount(0);
  });

  await test.step("apagado: queda apagado al guardar, con sus días, y al volver sigue así", async () => {
    await page.goto("/configuracion");
    await settings(page).getByText("Recordatorio", { exact: true }).click();
    await expect(settings(page).getByLabel("Días sin registrar")).toBeDisabled();
    await settings(page).getByRole("button", { name: "Guardar" }).click();
    await expect(toast(page, "Se apagó el recordatorio de registro")).toHaveAttribute("data-tone", "removal");
    await expect(settings(page).getByRole("button", { name: "Guardar" })).toBeEnabled();
    await expect(settings(page).getByRole("switch", { name: /Recordatorio/ })).not.toBeChecked();
    await page.reload();
    await expect(settings(page).getByRole("switch", { name: /Recordatorio/ })).not.toBeChecked();
    await expect(settings(page).getByText("Apagado", { exact: true })).toBeVisible();
    await expect(settings(page).getByLabel("Días sin registrar")).toHaveValue("2");
  });
});
