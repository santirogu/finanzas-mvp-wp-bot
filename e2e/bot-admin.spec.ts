import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { goToWhatsApp, newPerson, register, test, visible } from "./helpers";
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
  await goToWhatsApp(beto);
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
    for (const label of ["Vinculó su número", "Registró movimientos", "Comandos (balance, reporte, deshacer, ayuda)", "Respuesta sin registrar nada", "No era texto (audio, foto…)"]) {
      await expect(outcome(page, label)).toContainText("1 · 20%");
    }
    await expect(visible(page.getByText(/^La mitad de las veces responde en menos de .+; el 95 %, en menos de/))).toBeVisible();
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

  await test.step("tocar una barra filtra por ese resultado; Por cuenta dice de quién son", async () => {
    const results = visible(page.getByRole("region", { name: "Qué pasó con los mensajes" }));
    await results.getByRole("link", { name: /^Registró movimientos/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("resultado")).toBe("registrado");
    // La búsqueda se conserva.
    expect(new URL(page.url()).searchParams.get("q")).toBe(spaced(phone));
    await expect(results.getByRole("link", { name: /^Registró movimientos/ })).toHaveAttribute("aria-current", "true");
    await expect(visible(page.getByRole("link", { name: "Quitar filtro: Resultado: Registró movimientos" }))).toBeVisible();
    await expect(stat(page, "Mensajes")).toHaveText("1");
    // Las demás barras siguen ahí para cambiar de resultado.
    await expect(results.getByRole("link")).toHaveCount(5);

    const accounts = visible(page.getByRole("list", { name: "Cuentas" })).getByRole("listitem");
    await expect(accounts).toHaveCount(1);
    await expect(accounts.first()).toContainText("Beto Bot");
    await expect(accounts.first()).toContainText("1 mensaje");
    await expect(accounts.first()).toContainText("120 tokens");
    expect(await seriousViolations(page)).toEqual([]);

    await results.getByRole("link", { name: /^Registró movimientos/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("resultado")).toBeNull();
  });

  await test.step("Por cuenta: Beto y el audio (llegó sin cuenta), con su orden y su enlace a Usuarios", async () => {
    const accounts = visible(page.getByRole("list", { name: "Cuentas" })).getByRole("listitem");
    await expect(accounts).toHaveCount(2);
    await expect(accounts.nth(0)).toContainText("Beto Bot");
    await expect(accounts.nth(0)).toContainText("4 mensajes");
    await expect(accounts.nth(1)).toContainText("Números sin cuenta");
    await expect(accounts.nth(1)).toContainText("1 número");
    const sort = visible(page.getByRole("navigation", { name: "Ordenar por" }));
    await expect(sort.getByRole("link", { name: "Tokens" })).toHaveAttribute("aria-current", "true");
    await sort.getByRole("link", { name: "Último mensaje" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("orden")).toBe("ultimo");
    await accounts.nth(0).getByRole("link", { name: "Beto Bot" }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
    await expect(heading(page, /Beto Bot/)).toBeVisible();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("orden")).toBe("ultimo");
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
  await expect(visible(page.getByText("Ninguna cuenta con estos filtros."))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("los errores se leen: la explicación de Meta y cuántos números los tuvieron", async ({ page }) => {
  // Lo que respondió Meta en producción (13 de octubre de 2026), con un número que el bot aún no
  // había identificado (sin cuenta). Se insertan en la base: el WhatsApp falso no falla así.
  const phone = newPhone();
  const meta =
    '400 {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030,"type":"OAuthException","error_data":{"messaging_product":"whatsapp","details":"El número de teléfono del destinatario no está en la lista de autorizados: Agrega el número de teléfono del destinatario a la lista de destinatarios y vuelve a intentarlo."},"fbtrace_id":"AKrw3fJ7aDnkLUcNSu3rO_K"}}';
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  for (const error of [`envío: ${meta}`, `envío: ${meta}`]) {
    await sql`
      insert into whatsapp_message (id, phone, body, status, error, processed_at)
      values (${`wamid.e2e.${randomUUID()}`}, ${phone}, 'hola', 'failed', ${error}, now())`;
  }
  await sql.end();

  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.goto(`/admin/bot?q=${phone}`);
  const errors = visible(page.getByRole("region", { name: "Errores" }));
  await expect(errors.getByRole("listitem")).toHaveCount(1);
  await expect(errors).toContainText("No se pudo enviar la respuesta por WhatsApp");
  await expect(errors).toContainText("2 veces · 1 número");
  await expect(errors).toContainText(
    "HTTP 400 · (#131030) El número de teléfono del destinatario no está en la lista de autorizados",
  );
  await expect(errors).not.toContainText("fbtrace_id");
  await expect(stat(page, "Errores")).toHaveText("2");
  expect(await seriousViolations(page)).toEqual([]);
});
