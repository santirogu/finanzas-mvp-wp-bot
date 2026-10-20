import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { addTransaction, newPerson, openTab, register, test, toast, toasts, visible } from "./helpers";

// Borrar un movimiento desde la lista se puede deshacer durante unos segundos: el aviso emergente rojo
// "Se borró… · Deshacer". Recibe el foco: con el teclado o un lector de pantalla no se vuelve al
// principio de la página (la fila borrada ya no está).

// Las filas de la lista (en la página, no en los avisos, que también son elementos de lista).
const row = (page: Page, description: string) =>
  visible(page.getByRole("main").getByRole("listitem").filter({ hasText: description }));

test("borrar un movimiento y deshacerlo @principal", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "38000", description: "Almuerzo con el equipo", category: "Alimentación" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();

  await test.step("borrar: el aviso (rojo) recibe el foco y ofrece deshacer", async () => {
    await visible(page.getByRole("button", { name: "Eliminar Almuerzo con el equipo" })).click();
    const deleted = toast(page, "Se borró «Almuerzo con el equipo»");
    await expect(deleted).toBeFocused();
    await expect(deleted).toHaveAttribute("data-tone", "removal");
    // El aviso venía en la URL (?borrado=<id>) y se quita al mostrarlo: al recargar no vuelve.
    await expect(page).toHaveURL(/\/egresos$/);
    await expect(visible(page.getByText("No has registrado egresos este mes."))).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("deshacer: el movimiento vuelve a la lista, con su aviso verde; la X lo cierra", async () => {
    await toast(page, "Se borró").getByRole("button", { name: "Deshacer" }).click();
    const restored = toast(page, "Se restauró «Almuerzo con el equipo»");
    await expect(restored).toBeFocused();
    await expect(restored).toHaveAttribute("data-tone", "success");
    // Antes de que se vaya solo (4 segundos): con la X se cierra y el foco vuelve al contenido.
    await restored.getByRole("button", { name: "Cerrar el aviso" }).click();
    // (Otro aviso que quede, como "Egreso registrado", puede bajar justo bajo el mouse: ahí se pausa.)
    await expect(toasts(page).filter({ hasText: "Se restauró" })).toHaveCount(0);
    await expect(page.locator("#contenido")).toBeFocused();
    await expect(row(page, "Almuerzo con el equipo")).toContainText("−$38.000,00");
    await expect(visible(page.getByText("1 movimiento este mes"))).toBeVisible();
    await expect(page).toHaveURL(/\/egresos$/);
  });
});

test("los avisos se van solos: 4 segundos los de confirmación, 10 los que tienen Deshacer", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "9500", description: "Café" });
  await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
  await expect(toast(page, /^Egreso registrado$/)).toBeHidden({ timeout: 6_000 });

  // Con el reloj simulado: el tiempo avanza a mano y la prueba no espera 10 segundos de verdad.
  await page.clock.install();
  await visible(page.getByRole("button", { name: "Eliminar Café" })).click();
  const deleted = toast(page, "Se borró «Café»");
  await expect(deleted).toBeVisible();
  // A los 6 segundos sigue (un aviso común ya se habría ido); a los 10, se va.
  await page.clock.runFor(6_000);
  await expect(deleted).toBeVisible();
  await page.clock.runFor(4_100);
  await expect(deleted).toBeHidden();
});

test("el aviso de otra persona no se muestra ni se puede deshacer", async ({ page, browser }) => {
  await register(page);
  await openTab(page, "Ingresos");
  await addTransaction(page, { amount: "2000000", description: "Quincena de Ana" });
  await expect(toast(page, /^Ingreso registrado$/)).toBeVisible();
  const id = await row(page, "Quincena de Ana").locator('input[name="id"]').getAttribute("value");
  await visible(page.getByRole("button", { name: "Eliminar Quincena de Ana" })).click();
  await expect(toast(page, "Se borró «Quincena de Ana»")).toBeVisible();

  // Beto abre el enlace que pide ese aviso: no lo ve (ni la descripción de Ana).
  const beto = await newPerson(browser);
  await register(beto, "Beto");
  await beto.goto(`/ingresos?borrado=${id}`);
  await expect(visible(beto.getByRole("heading", { name: "Ingresos" }))).toBeVisible();
  await expect(beto.getByText("Quincena de Ana")).toHaveCount(0);
  await expect(toasts(beto)).toHaveCount(0);
});
