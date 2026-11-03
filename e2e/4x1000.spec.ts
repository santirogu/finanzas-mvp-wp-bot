import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { goToWhatsApp, openTab, register, test, toast, visible } from "./helpers";
import { newPhone, nthQuestion, nthReply, sendWhatsApp, tapWhatsAppButton } from "./whatsapp";

// El 4x1000 (src/modules/transactions/gmf.ts): "Aplicar 4x1000" en el formulario de egresos y la pregunta del bot,
// un egreso aparte por el 0,4 %, en Impuestos y atado a su egreso. Se apaga en Configuración.

const row = (page: Page, description: string | RegExp) =>
  visible(page.getByRole("main").getByRole("listitem").filter({ hasText: description }));
const gmfBox = (page: Page) => visible(page.getByRole("checkbox", { name: "Aplicar 4x1000" }));

test("Aplicar 4x1000: registra aparte el 0,4 %, en Impuestos, y se va y vuelve con su egreso @principal", async ({ page }) => {
  await register(page);
  await openTab(page, "Egresos");
  const form = visible(page.locator("form").filter({ has: page.getByLabel(/^Monto/) }));

  await test.step("la casilla dice cuánto sería; al registrar, quedan los dos", async () => {
    await expect(gmfBox(page)).not.toBeChecked();
    await form.getByLabel(/^Monto/).fill("500000");
    await expect(gmfBox(page)).toHaveAccessibleDescription("Se registra aparte, en la categoría Impuestos: $2.000,00.");
    await form.getByLabel("Descripción").fill("Arriendo");
    await gmfBox(page).check();
    expect(await seriousViolations(page)).toEqual([]);
    await form.getByRole("button", { name: "Registrar egreso" }).click();
    await expect(toast(page, "Egreso y 4x1000 registrados")).toBeVisible();
    await expect(row(page, "4x1000 · Arriendo")).toContainText("−$2.000,00");
    await expect(row(page, "4x1000 · Arriendo")).toContainText("Impuestos");
    await expect(row(page, "−$500.000,00")).toContainText("Arriendo");
    // Para el siguiente egreso, vuelve sin marcar.
    await expect(gmfBox(page)).not.toBeChecked();
  });

  await test.step("borrar el egreso se lleva su 4x1000; deshacer los devuelve a los dos", async () => {
    await visible(page.getByRole("button", { name: "Eliminar Arriendo" })).click();
    await expect(visible(page.getByText("No has registrado egresos este mes."))).toBeVisible();
    await toast(page, "Se borró").getByRole("button", { name: "Deshacer" }).click();
    await expect(row(page, "4x1000 · Arriendo")).toBeVisible();
    await expect(visible(page.getByText("2 movimientos este mes"))).toBeVisible();
  });
});

test("apagado en Configuración, el formulario de egresos no lo ofrece", async ({ page }) => {
  await register(page);
  await page.goto("/configuracion");
  const section = visible(page.getByRole("region", { name: "4x1000" }));
  await expect(section.getByRole("switch", { name: /Cobro del 4x1000/ })).toBeChecked();
  await section.getByText("Cobro del 4x1000").click();
  await section.getByRole("button", { name: "Guardar" }).click();
  await expect(toast(page, "Apagaste el 4x1000: ya no te lo ofrecemos ni te lo preguntamos.")).toBeVisible();

  await openTab(page, "Egresos");
  await expect(visible(page.getByLabel(/^Monto/))).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Aplicar 4x1000" })).toHaveCount(0);
});

test("el bot pregunta con Sí y No después de registrar un egreso; con Sí, lo registra", async ({ page, request }) => {
  await register(page);
  const phone = newPhone();
  await goToWhatsApp(page);
  await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!;
  await sendWhatsApp(request, phone, code);
  await nthReply(request, phone, 1);

  await sendWhatsApp(request, phone, "almuerzo");
  expect(await nthReply(request, phone, 2)).toContain("*Almuerzo* — $25.900,50");
  const question = await nthQuestion(request, phone, 1);
  expect(question.text).toBe("¿Registro también el 4x1000 de este egreso?");
  expect(question.buttons?.map((button) => button.title)).toEqual(["Sí", "No"]);

  await tapWhatsAppButton(request, phone, question.buttons![0]);
  expect(await nthReply(request, phone, 3)).toMatch(/^✅ Registré el 4x1000:\n• \*4x1000 · Almuerzo\* — \$103,60\n/);

  await openTab(page, "Egresos");
  await expect(row(page, "4x1000 · Almuerzo")).toContainText("−$103,60");
});
