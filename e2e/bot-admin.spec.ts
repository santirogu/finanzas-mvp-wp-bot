import { expect, type Page } from "@playwright/test";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { newPerson, register, test, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// El Bot de WhatsApp en la administración: qué pasó con los mensajes, el consumo de Claude y los
// errores, sin el texto de los mensajes. Las pruebas corren en paralelo sobre la misma base: cada
// una busca sus propios números.

const spaced = (phone: string) => `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5)}`;
const search = (page: Page) => visible(page.getByRole("searchbox", { name: "Buscar" }));
/** Un dato de las tarjetas: la etiqueta (dt) y su valor (dd). */
const stat = (page: Page, label: string) =>
  visible(page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]"));
const outcome = (page: Page, label: string) =>
  visible(page.getByRole("region", { name: "Qué pasó con los mensajes" }).getByRole("listitem").filter({ hasText: label }));

async function searchFor(page: Page, text: string) {
  await search(page).fill(text);
  await search(page).press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(text);
}

test("el admin ve qué pasó con los mensajes de una cuenta y su consumo de Claude, sin el texto @principal", async ({
  page,
  browser,
  request,
}) => {
  // Beto vincula su número y usa el bot: un gasto, un comando, una pregunta y un audio.
  const beto = await newPerson(browser);
  const phone = newPhone();
  await register(beto, "Beto Bot");
  await beto.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(beto.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  const messages = [`VINCULAR ${code}`, "almuerzo 25.900,50", "balance", "hola, ¿cómo vas?", null];
  for (const [i, text] of messages.entries()) {
    await sendWhatsApp(request, phone, text);
    await nthReply(request, phone, i + 1);
  }
  await beto.context().close();

  await newAdmin(page);
  await setUpTwoFactor(page);
  await visible(
    page.getByRole("navigation", { name: "Secciones de administración" }).getByRole("link", { name: "Bot de WhatsApp" }),
  ).click();
  await expect(page).toHaveURL(/\/admin\/bot$/);
  await expect(heading(page, "Bot de WhatsApp")).toBeVisible();

  await test.step("con su número (escrito con espacios), cuenta cada mensaje por su resultado", async () => {
    await searchFor(page, spaced(phone));
    await expect(stat(page, "Mensajes")).toHaveText("5");
    await expect(stat(page, "Registraron movimientos")).toHaveText("1");
    await expect(stat(page, "Errores")).toHaveText("0");
    await expect(stat(page, "Llamadas a Claude")).toHaveText("2");
    for (const label of ["Vinculó su número", "Registró movimientos", "Comandos (balance, deshacer, ayuda)", "Respuesta sin registrar nada", "No era texto (audio, foto…)"]) {
      await expect(outcome(page, label)).toContainText("1 · 20%");
    }
    await expect(visible(page.getByText(/^Responde en .+ \(la mitad de las veces\)/))).toBeVisible();
  });

  await test.step("el consumo de Claude: tokens, por modelo y nadie en el tope", async () => {
    // El Claude falso cobra 100 tokens de entrada y 20 de salida por llamada.
    await expect(stat(page, "Tokens de entrada")).toHaveText("200");
    await expect(stat(page, "Tokens de salida")).toHaveText("40");
    await expect(visible(page.getByRole("listitem").filter({ hasText: "claude-" }))).toContainText(
      "2 llamadas · 200 de entrada · 40 de salida",
    );
    await expect(page.getByRole("table", { name: "Llamadas a Claude por día" })).toBeAttached();
    await expect(visible(page.getByText("Ninguna."))).toBeVisible();
    await expect(visible(page.getByText("Sin errores con estos filtros."))).toBeVisible();
  });

  await test.step("nunca muestra lo que escribió ni lo que le respondió el bot", async () => {
    const text = await page.locator("main").innerText();
    for (const secret of ["almuerzo", "Almuerzo", "25.900", "cómo vas", "VINCULAR", code, "Balance de", "Claude falso"]) {
      expect(text).not.toContain(secret);
    }
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("la fecha se combina con la búsqueda y se quita con su ✕", async () => {
    await visible(page.getByRole("button", { name: /^Filtros/ })).click();
    const group = visible(page.getByRole("group", { name: "Fecha de los mensajes" }));
    await group.locator("label").filter({ has: page.getByRole("radio", { name: "Hoy", exact: true }) }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("fecha")).toBe("hoy");
    await expect(stat(page, "Mensajes")).toHaveText("5");
    await visible(page.getByRole("link", { name: /^Quitar filtro: “/ })).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
    expect(new URL(page.url()).searchParams.get("fecha")).toBe("hoy");
  });
});

test("un número sin vincular cuenta aparte, y sin mensajes la página lo dice", async ({ page, request }) => {
  const phone = newPhone();
  await sendWhatsApp(request, phone, "hola");
  await nthReply(request, phone, 1);

  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.goto(`/admin/bot?q=${phone}`);
  await expect(stat(page, "Mensajes")).toHaveText("1");
  await expect(outcome(page, "Número sin vincular")).toContainText("1 · 100%");
  await expect(stat(page, "Llamadas a Claude")).toHaveText("0");

  await page.goto(`/admin/bot?q=${newPhone()}`);
  await expect(stat(page, "Mensajes")).toHaveText("0");
  await expect(visible(page.getByText("No hay mensajes con estos filtros."))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
