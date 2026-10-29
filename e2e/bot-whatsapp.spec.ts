import { randomInt, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { FAKE_SERVICES_URL } from "./fake-config";
import { formatMonthLabel, formatMonthName, monthOf, monthParam, shiftMonth, todayInTimezone } from "../src/lib/dates";
import { addTransaction, goToWhatsApp, openTab, register, test, toast, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp, sendWhatsAppPhoto, sentTo } from "./whatsapp";

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
    expect(reply).toContain("Más detalle en *Reportes*: http://localhost:3100/reportes");
    expect((await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).length).toBe(claudeBefore);
  });

  await test.step("la foto de una factura queda registrada con su total: el bot la baja de Meta y se la manda a Claude", async () => {
    await sendWhatsAppPhoto(request, phone, "mercado del mes");
    expect(await nthReply(request, phone, 10)).toMatch(/✅ Egreso Anotado: \*Éxito\* — \$85\.400,00 \(Mercado\)/);
    // El Claude falso solo la entiende si le llegaron los mismos bytes de la foto.
    expect(await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).toContain("[foto] mercado del mes");

    await page.reload();
    const row = visible(page.getByRole("listitem").filter({ hasText: "Éxito" }));
    await expect(row).toContainText("Mercado · vía WhatsApp");
    await expect(row).toContainText(/−\$85\.400,00/);
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
    "Ese código no es válido o ya venció. Pide otro en *Mi cuenta*: toca *Conectar WhatsApp*.",
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

// A una cuenta vinculada le responde que solo entiende textos y fotos (en la prueba en inglés, abajo).
test("a un audio de un número sin vincular le explica cómo vincularlo", async ({ request }) => {
  const phone = newPhone();
  await sendWhatsApp(request, phone, null);
  expect(await nthReply(request, phone, 1)).toContain("Este número aún no está vinculado a una cuenta.");
});

test("en inglés: vincular con LINK desde Mi cuenta, y el bot responde en inglés también a los comandos en español @principal", async ({
  page,
  request,
}) => {
  const phone = newPhone();
  await register(page, "Ana Pérez");

  await test.step("la cuenta en inglés (Configuración → Idioma)", async () => {
    await page.goto("/configuracion");
    await visible(page.getByRole("group", { name: "Idioma" })).locator("label", { hasText: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  const code = await test.step("Mi cuenta muestra el mensaje con LINK", async () => {
    await page.goto("/cuenta");
    await visible(page.getByRole("button", { name: "Connect WhatsApp" })).click();
    const message = visible(page.getByText(/^LINK \d{6}$/));
    await expect(message).toBeVisible();
    await expect(page.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/573000000000\?text=LINK%20\d{6}$/);
    return (await message.textContent())!.replace("LINK ", "");
  });

  await test.step("LINK y el código vinculan la cuenta, con la respuesta en inglés", async () => {
    await sendWhatsApp(request, phone, `LINK ${code}`);
    expect(await nthReply(request, phone, 1)).toBe("✅ All set, Ana! Your WhatsApp is linked.\n\nTry writing me: _spent 20k on lunch_");
    await expect(visible(page.getByText("Connected"))).toBeVisible({ timeout: 15_000 });
    await expect(visible(page.getByText("“spent 20k on lunch”"))).toBeVisible();
  });

  await test.step("un gasto: la confirmación en inglés, con los montos de EE. UU.", async () => {
    await sendWhatsApp(request, phone, "I bought some shoes for $500.000");
    const reply = await nthReply(request, phone, 2);
    expect(reply).toMatch(/^✅ Expense noted: \*Shoes\* — \$500,000\.00 \(/);
    expect(reply).toMatch(/\n[A-Z][a-z]+ balance: \*−\$500,000\.00\*\n_Send \*undo\* if I got it wrong\._$/);
  });

  await test.step("los comandos en inglés y en español responden en inglés; un audio, que solo entiende textos y fotos", async () => {
    await sendWhatsApp(request, phone, "report");
    expect(await nthReply(request, phone, 3)).toMatch(/^📊 \*Report from [A-Z][a-z]+ \d{4} to [A-Z][a-z]+ \d{4}\*\nIncome: \$0\.00\nExpenses: \$500,000\.00\n/);
    await sendWhatsApp(request, phone, "deshacer");
    expect(await nthReply(request, phone, 4)).toBe("Done, I deleted:\n🗑️ Shoes — $500,000.00");
    await sendWhatsApp(request, phone, null);
    expect(await nthReply(request, phone, 5)).toBe("For now I only understand text messages ✍️ and photos of receipts 🧾");
  });

  await test.step("a otro número, sin vincular: en español y debajo en inglés; un código que no sirve, en el idioma de la palabra", async () => {
    const other = newPhone();
    await sendWhatsApp(request, other, "hi");
    const reply = await nthReply(request, other, 1);
    expect(reply).toMatch(/^Hola 👋\nEste número aún no está vinculado/);
    expect(reply).toContain("\n\nHi 👋\nThis number isn't linked to an account yet.");
    await sendWhatsApp(request, other, "LINK 000000");
    expect(await nthReply(request, other, 2)).toBe("That code isn't valid or it expired. Get another one in *My account*: tap *Connect WhatsApp*.");
  });
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

// Safari mide de menos un texto con white-space: nowrap dentro de un párrafo: entre 428 y 442 px de ancho (los
// iPhone Pro Max), con uno de cada tres finales de número, el número vinculado se salía de la tarjeta hasta 3 px.
// Con este final (0002) se salía.
test("en Safari, el número vinculado cabe en la tarjeta de los iPhone Pro Max @safari", async ({ page, request }) => {
  const phone = `57300${randomInt(100, 1000)}0002`;
  await register(page);
  await goToWhatsApp(page);
  await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, phone, `VINCULAR ${code}`);
  await nthReply(request, phone, 1);
  await page.reload();
  const linked = visible(page.getByText(/^Registra movimientos escribiendo desde/));
  await expect(linked).toContainText("+57 300 ••• 0002");
  for (const width of [428, 430, 434, 438, 440, 442]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await linked.evaluate((p) => p.scrollWidth - p.clientWidth), `${width} px`).toBeLessThanOrEqual(0);
  }
});
