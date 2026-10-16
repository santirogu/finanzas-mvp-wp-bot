import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { addTransaction, newPerson, openTab, register, test, visible } from "./helpers";

// Borrar un movimiento desde la lista se puede deshacer durante unos minutos (el aviso "Se borró… ·
// Deshacer"), y el foco va al aviso: con el teclado o un lector de pantalla no se vuelve al
// principio de la página.

const row = (page: Page, description: string) =>
  visible(page.getByRole("listitem").filter({ hasText: description }));
const notice = (page: Page, text: string) => visible(page.getByRole("status").filter({ hasText: text }));

test("borrar un movimiento y deshacerlo @principal", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "38000", description: "Almuerzo con el equipo", category: "Alimentación" });
  await expect(visible(page.getByText("✓ Egreso registrado"))).toBeVisible();

  await test.step("borrar: el aviso recibe el foco y ofrece deshacer", async () => {
    await visible(page.getByRole("button", { name: "Eliminar Almuerzo con el equipo" })).click();
    const deleted = notice(page, "Se borró «Almuerzo con el equipo».");
    await expect(deleted).toBeFocused();
    await expect(page).toHaveURL(/\/egresos\?borrado=[0-9a-f-]{36}$/);
    await expect(visible(page.getByText("No has registrado egresos este mes."))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("deshacer: el movimiento vuelve a la lista", async () => {
    await notice(page, "Se borró").getByRole("button", { name: "Deshacer" }).click();
    await expect(notice(page, "Se restauró «Almuerzo con el equipo».")).toBeFocused();
    await expect(row(page, "Almuerzo con el equipo")).toContainText("−$38.000,00");
    await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();
  });

  await test.step("cerrar el aviso", async () => {
    await notice(page, "Se restauró").getByRole("link", { name: "Cerrar el aviso" }).click();
    await expect(page).toHaveURL(/\/egresos$/);
    await expect(visible(page.getByRole("status").filter({ hasText: "Se restauró" }))).toHaveCount(0);
    await expect(row(page, "Almuerzo con el equipo")).toBeVisible();
  });
});

test("el aviso de otra persona no se muestra ni se puede deshacer", async ({ page, browser }) => {
  await register(page);
  await openTab(page, "Ingresos");
  await addTransaction(page, { amount: "2000000", description: "Quincena de Ana" });
  await expect(visible(page.getByText("✓ Ingreso registrado"))).toBeVisible();
  await visible(page.getByRole("button", { name: "Eliminar Quincena de Ana" })).click();
  await expect(notice(page, "Se borró «Quincena de Ana».")).toBeVisible();
  const deletedUrl = page.url();

  // Beto abre el mismo enlace: no ve el aviso (ni la descripción de Ana).
  const beto = await newPerson(browser);
  await register(beto, "Beto");
  await beto.goto(new URL(deletedUrl).pathname + new URL(deletedUrl).search);
  await expect(visible(beto.getByRole("heading", { name: "Ingresos" }))).toBeVisible();
  await expect(beto.getByText("Quincena de Ana")).toHaveCount(0);
  await expect(beto.getByRole("button", { name: "Deshacer" })).toHaveCount(0);
});
