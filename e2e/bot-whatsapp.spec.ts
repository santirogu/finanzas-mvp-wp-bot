import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { FAKE_SERVICES_URL } from "./fake-config";
import { openTab, register, test, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp, sentTo } from "./whatsapp";

// El bot de WhatsApp de punta a punta: los mensajes llegan al webhook firmados igual que los manda
// Meta, la app los procesa en el servidor real de Next y responde a un WhatsApp falso
// (e2e/fake-services.mjs), que guarda lo que "envió". La interpretación de texto libre la hace un
// Claude falso con respuestas fijas. Nada sale a internet ni gasta créditos.

test("vincular el número desde el dashboard y llevar las cuentas por WhatsApp", async ({ page, request }) => {
  const phone = newPhone();
  await register(page, "Ana Pérez");

  const code = await test.step("generar el código en el dashboard", async () => {
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
  });

  await test.step("un gasto escrito como a una persona queda registrado en la web", async () => {
    await sendWhatsApp(request, phone, "me compré unos zapatos de $500.000");
    const reply = await nthReply(request, phone, 2);
    expect(reply).toMatch(/✅ Egreso registrado: \*Zapatos\* — \$500\.000,00 \(Ropa\)/);
    expect(reply).toMatch(/Balance de [a-z]+: \*-\$500\.000,00\*/);

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
});

test("un número sin vincular recibe instrucciones y no puede usar el bot", async ({ request }) => {
  const phone = newPhone();
  const claudeBefore = (await (await request.get(`${FAKE_SERVICES_URL}/claude`)).json()).length;

  await sendWhatsApp(request, phone, "me compré unos zapatos de $500.000");
  expect(await nthReply(request, phone, 1)).toContain("Este número aún no está vinculado a una cuenta.");
  expect(await nthReply(request, phone, 1)).toContain("http://localhost:3100/dashboard");

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
    "Ese código no es válido o ya venció. Genera uno nuevo en el dashboard.",
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
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await sentTo(request, phone)).toHaveLength(1);
});

test("a un audio responde que por ahora solo entiende texto", async ({ request }) => {
  const phone = newPhone();
  await sendWhatsApp(request, phone, null);
  expect(await nthReply(request, phone, 1)).toBe("Por ahora solo entiendo mensajes de texto ✍️");
});
