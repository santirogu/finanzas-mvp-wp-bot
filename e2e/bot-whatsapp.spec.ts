import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { FAKE_SERVICES_URL } from "./fake-config";
import { formatMonthLabel, formatMonthName, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { addTransaction, goToWhatsApp, openTab, register, test, toast, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp, sentTo } from "./whatsapp";

// El bot de WhatsApp de punta a punta: los mensajes llegan al webhook firmados igual que los manda
// Meta, la app los procesa en el servidor real de Next y responde a un WhatsApp falso
// (e2e/fake-services.mjs), que guarda lo que "envió". La interpretación de texto libre la hace un
// Claude falso con respuestas fijas. Nada sale a internet ni gasta créditos.

test("vincular el número desde Mi cuenta y llevar las cuentas por WhatsApp", async ({ page, request }) => {
  const phone = newPhone();
  await register(page, "Ana Pérez");
  const hint = () => visible(page.getByRole("link", { name: /^Registra tus gastos por WhatsApp/ }));

  const code = await test.step("el aviso del Resumen lleva a Mi cuenta, donde se genera el código", async () => {
    await hint().click();
    await expect(page).toHaveURL(/\/cuenta#whatsapp$/);
    await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
    const message = visible(page.getByText(/^VINCULAR \d{6}$/));
    await expect(message).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir WhatsApp" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/573000000000\?text=VINCULAR%20\d{6}$/,
    );
    return (await message.textContent())!.replace("VINCULAR ", "");
  });

  await test.step("enviar el código por WhatsApp vincula la cuenta", async () => {
    expect((await sendWhatsApp(request, phone, `VINCULAR ${code}`)).status()).toBe(200);
    expect(await nthReply(request, phone, 1)).toContain("¡Listo, Ana! Tu WhatsApp quedó vinculado.");
    // La tarjeta revisa sola cada 4 segundos si ya quedó vinculado.
    await expect(visible(page.getByText("Conectado"))).toBeVisible({ timeout: 15_000 });
    // El número se muestra enmascarado.
    await expect(visible(page.getByText(`+57 300 ••• ${phone.slice(-4)}`))).toBeVisible();
    // Ya vinculado, el Resumen no muestra el aviso.
    await page.goto("/dashboard");
    await expect(visible(page.getByText("Balance del mes"))).toBeVisible();
    await expect(page.getByRole("link", { name: /^Registra tus gastos por WhatsApp/ })).toHaveCount(0);
  });

  await test.step("un gasto escrito como a una persona queda registrado en la web", async () => {
    await sendWhatsApp(request, phone, "me compré unos zapatos de $500.000");
    const reply = await nthReply(request, phone, 2);
    expect(reply).toMatch(/✅ Egreso Anotado: \*Zapatos\* — \$500\.000,00 \(Ropa\)/);
    expect(reply).toMatch(/Balance de [a-z]+: \*−\$500\.000,00\*/);

    await openTab(page, "Egresos");
    const row = visible(page.getByRole("listitem").filter({ hasText: "Zapatos" }));
    await expect(row).toContainText("Ropa · vía WhatsApp");
    await expect(row).toContainText(/−\$500\.000,00/);
  });

  await test.step("balance responde con los totales del mes", async () => {
    await sendWhatsApp(request, phone, "balance");
    const reply = await nthReply(request, phone, 3);
    expect(reply).toMatch(/Ingresos: \$0,00/);
    expect(reply).toMatch(/Egresos: \$500\.000,00/);
  });

  await test.step("deshacer borra lo último registrado por WhatsApp, también en la web", async () => {
    await sendWhatsApp(request, phone, "deshacer");
    expect(await nthReply(request, phone, 4)).toMatch(/Listo, eliminé:\n🗑️ Zapatos — \$500\.000,00/);
    await page.reload();
    await expect(visible(page.getByText("No has registrado egresos este mes."))).toBeVisible();
  });

  await test.step("un monto con centavos se guarda con sus centavos", async () => {
    await sendWhatsApp(request, phone, "almuerzo 25.900,50");
    expect(await nthReply(request, phone, 5)).toMatch(/✅ Egreso Anotado: \*Almuerzo\* — \$25\.900,50 \(Alimentación\)/);
    await page.reload();
    await expect(visible(page.getByRole("listitem").filter({ hasText: "Almuerzo" }))).toContainText(/−\$25\.900,50/);
  });

  await test.step("\"balance mes pasado\" y \"balance <mes>\" dan los totales de otro mes", async () => {
    // Un egreso del mes pasado, registrado desde la web.
    const previous = shiftMonth(monthOf(todayInTimezone("America/Bogota")), -1);
    await addTransaction(page, { amount: "1200000", description: "Arriendo", date: `${monthParam(previous)}-05` });
    await expect(toast(page, /^Egreso registrado en /)).toBeVisible();

    await sendWhatsApp(request, phone, "balance mes pasado");
    const reply = await nthReply(request, phone, 6);
    expect(reply).toContain(`📊 *${formatMonthLabel(previous)}*`);
    expect(reply).toMatch(/Egresos: \$1\.200\.000,00\nBalance: \*−\$1\.200\.000,00\*$/);

    // Un mes que todavía no llega.
    const later = shiftMonth(previous, 3);
    await sendWhatsApp(request, phone, `balance ${formatMonthName(later)} ${later.year}`);
    expect(await nthReply(request, phone, 7)).toContain(`${formatMonthLabel(later)} todavía no llega`);
  });

  await test.step("una pregunta en palabras también da el balance de ese mes, sin Claude", async () => {
    const previous = shiftMonth(monthOf(todayInTimezone("America/Bogota")), -1);
    await sendWhatsApp(request, phone, `¿Cuántos fueron mis egresos en ${formatMonthName(previous)} de ${previous.year}?`);
    const reply = await nthReply(request, phone, 8);
    expect(reply).toContain(`📊 *${formatMonthLabel(previous)}*`);
    expect(reply).toContain("Egresos: $1.200.000,00");
  });

  await test.step("\"reporte\" resume los últimos 12 meses (lo de Reportes) y lleva a la web, sin Claude", async () => {
    const claudeBefore = (await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).length;
    await sendWhatsApp(request, phone, "reporte");
    const reply = await nthReply(request, phone, 9);
    const current = monthOf(todayInTimezone("America/Bogota"));
    const from = formatMonthName(shiftMonth(current, -11), { withYear: true });
    expect(reply).toMatch(new RegExp(`^📊 \\*Reporte de ${from} a ${formatMonthName(current, { withYear: true })}\\*\n`));
    // El arriendo del mes pasado (1.200.000) y el almuerzo de hoy (25.900,50).
    expect(reply).toContain("Egresos: $1.225.900,50");
    expect(reply).toContain("Más detalle: http://localhost:3100/reportes");
    expect((await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).length).toBe(claudeBefore);
  });
});

test("un número sin vincular recibe instrucciones y no puede usar el bot", async ({ request }) => {
  const phone = newPhone();
  const claudeBefore = (await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).length;

  await sendWhatsApp(request, phone, "me compré unos zapatos de $500.000");
  expect(await nthReply(request, phone, 1)).toContain("Este número aún no está vinculado a una cuenta.");
  expect(await nthReply(request, phone, 1)).toContain("http://localhost:3100/cuenta");

  await sendWhatsApp(request, phone, "balance");
  expect(await nthReply(request, phone, 2)).toContain("aún no está vinculado");

  // Sin vínculo, el mensaje ni siquiera llega a Claude.
  const claudeAfter: string[] = await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json();
  expect(claudeAfter.slice(claudeBefore)).not.toContain("me compré unos zapatos de $500.000");
});

test("un código inválido no vincula nada", async ({ request }) => {
  const phone = newPhone();
  await sendWhatsApp(request, phone, "VINCULAR 000000");
  expect(await nthReply(request, phone, 1)).toBe(
    "Ese código no es válido o ya venció. Genera uno nuevo en Mi cuenta.",
  );
});

test("rechaza mensajes con una firma que no es de Meta, sin procesarlos", async ({ request }) => {
  const phone = newPhone();
  const response = await sendWhatsApp(request, phone, "balance", { secret: "otra-clave" });
  expect(response.status()).toBe(401);

  // Ni respuesta ni procesamiento: se le da tiempo a la app por si lo procesara igual.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await sentTo(request, phone)).toEqual([]);
});

test("si Meta entrega el mismo mensaje dos veces, se procesa una sola vez", async ({ request }) => {
  const phone = newPhone();
  const id = `wamid.e2e.repetido.${randomUUID()}`;
  await sendWhatsApp(request, phone, "balance", { id });
  await sendWhatsApp(request, phone, "balance", { id });

  await nthReply(request, phone, 1);
  // En vez de esperar un tiempo fijo: otro mensaje (con otro id), después. Cuando llega su respuesta, el
  // repetido (que llegó antes) ya se habría procesado: con él serían tres respuestas; tienen que ser dos.
  await sendWhatsApp(request, phone, "balance", { id: `wamid.e2e.otro.${randomUUID()}` });
  await nthReply(request, phone, 2);
  expect(await sentTo(request, phone)).toHaveLength(2);
});

test("a un audio responde que por ahora solo entiende texto", async ({ request }) => {
  const phone = newPhone();
  await sendWhatsApp(request, phone, null);
  expect(await nthReply(request, phone, 1)).toBe("Por ahora solo entiendo mensajes de texto ✍️");
});

test("el bot guarda la descripción que ya está en el historial, con su categoría @principal", async ({ page, request }) => {
  const phone = newPhone();
  await register(page, "Ana Pérez");
  await openTab(page, "Egresos");
  await addTransaction(page, { amount: "98000", description: "Claro Postpago Cata Amor", category: "Servicios" });
  await expect(toast(page, "Egreso registrado")).toBeVisible();

  await goToWhatsApp(page);
  await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, phone, `VINCULAR ${code}`);
  await nthReply(request, phone, 1);

  await sendWhatsApp(request, phone, "pago claro amor 98 mil");
  expect(await nthReply(request, phone, 2)).toMatch(/✅ Egreso Anotado: \*Claro Postpago Cata Amor\* — \$98\.000,00 \(Servicios\)/);
  await openTab(page, "Egresos");
  const rows = visible(page.getByRole("listitem").filter({ hasText: "Claro Postpago Cata Amor" }));
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "vía WhatsApp" })).toContainText("Servicios");
});
