import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { adminTab, heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { newPerson, register, test, uniqueEmail, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// La página de administración: el historial de registro y vinculación de todas las cuentas, como
// línea de tiempo por día, con búsqueda y filtros en chips. Las pruebas corren en paralelo sobre la
// misma base, así que cada una busca lo suyo (correo o número únicos) en vez de contar todo.

const formatted = (phone: string) => `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
/** Los eventos de la línea de tiempo, en orden (cada uno es un elemento de lista). */
const events = (page: Page) => visible(page.locator("main ol > li"));
const search = (page: Page) => visible(page.getByRole("searchbox", { name: "Buscar" }));
const filtersButton = (page: Page) => visible(page.getByRole("button", { name: /^Filtros/ }));
const summary = (page: Page, text: string) => visible(page.getByText(text, { exact: true }));

/** Un admin con la verificación lista, en el Historial (desde la subnavegación). */
async function adminReady(page: Page) {
  await newAdmin(page);
  await setUpTwoFactor(page);
  await visible(page.getByRole("navigation", { name: "Secciones de administración" }).getByRole("link", { name: "Historial" })).click();
  await expect(page).toHaveURL(/\/admin\/historial$/);
}

async function searchFor(page: Page, text: string) {
  await search(page).fill(text);
  await search(page).press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(text);
}

/** Abre el panel (si está cerrado) y toca un chip; espera a que se aplique. */
async function toggleChip(page: Page, name: string, role: "checkbox" | "radio") {
  if ((await filtersButton(page).getAttribute("aria-expanded")) !== "true") await filtersButton(page).click();
  const before = page.url();
  // La casilla es invisible (sr-only): se toca su etiqueta, como una persona.
  await visible(page.locator("label").filter({ has: page.getByRole(role, { name, exact: true }) })).click();
  if (name !== "Personalizado") await expect(page).not.toHaveURL(before);
}

test("el admin ve el historial de otras cuentas como línea de tiempo y lo filtra con chips", async ({ page, browser, request }) => {
  // Otra persona se registra y vincula su WhatsApp con el bot; alguien más prueba un código malo.
  const beto = await newPerson(browser);
  const betoEmail = uniqueEmail();
  const betoPhone = newPhone();
  const strangerPhone = newPhone();
  await register(beto, "Beto Historial", betoEmail);
  await beto.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(beto.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, betoPhone, `VINCULAR ${code}`);
  await nthReply(request, betoPhone, 1);
  await sendWhatsApp(request, strangerPhone, "VINCULAR 000000");
  await nthReply(request, strangerPhone, 1);

  await adminReady(page);
  await expect(heading(page, "Registro y vinculación de WhatsApp")).toBeVisible();
  await expect(filtersButton(page)).toHaveAccessibleName("Filtros");

  await test.step("buscar por correo muestra su historial, agrupado en 'Hoy', del más nuevo al más viejo", async () => {
    await searchFor(page, betoEmail);
    await expect(summary(page, "3 eventos")).toBeVisible();
    await expect(heading(page, "Hoy")).toBeVisible();
    await expect(events(page).nth(0)).toContainText(`Beto Historial vinculó su WhatsApp ${formatted(betoPhone)}`);
    await expect(events(page).nth(1)).toContainText("Beto Historial pidió un código para vincular su WhatsApp");
    await expect(events(page).nth(2)).toContainText("Beto Historial se registró");
    for (let i = 0; i < 3; i++) await expect(events(page).nth(i)).toContainText(betoEmail);
    // La búsqueda queda como filtro activo, con su ✕.
    await expect(visible(page.getByRole("link", { name: `Quitar filtro: “${betoEmail}”` }))).toBeVisible();
    await expect(filtersButton(page)).toHaveAccessibleName("Filtros (activos: 1)");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("buscar por número (escrito como sea) encuentra el intento fallido sin cuenta", async () => {
    await searchFor(page, formatted(strangerPhone));
    await expect(summary(page, "1 evento")).toBeVisible();
    await expect(events(page).first()).toContainText(`Intento fallido de vinculación desde ${formatted(strangerPhone)}`);
    await expect(events(page).first()).toContainText("Sin cuenta · código inválido o vencido");
  });

  await test.step("los chips de tipo filtran al instante y se pueden combinar", async () => {
    await searchFor(page, betoEmail);
    await toggleChip(page, "Vinculaciones", "checkbox");
    await expect(summary(page, "1 evento")).toBeVisible();
    await expect(events(page).first()).toContainText("vinculó su WhatsApp");
    // El panel sigue abierto para seguir eligiendo.
    await expect(filtersButton(page)).toHaveAttribute("aria-expanded", "true");
    await toggleChip(page, "Registros", "checkbox");
    await expect(summary(page, "2 eventos")).toBeVisible();
    await expect(filtersButton(page)).toHaveAccessibleName("Filtros (activos: 3)");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("las fechas: atajo de hoy, y un rango personalizado desde mañana deja la lista vacía", async () => {
    await toggleChip(page, "Hoy", "radio");
    await expect(summary(page, "2 eventos")).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "Quitar filtro: Hoy" }))).toBeVisible();

    await toggleChip(page, "Personalizado", "radio");
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(Date.now() + 86_400_000));
    await visible(page.getByLabel("Desde")).fill(tomorrow);
    await visible(page.getByRole("button", { name: "Aplicar" })).click();
    await expect(summary(page, "No hay eventos con estos filtros.")).toBeVisible();
    await expect(events(page)).toHaveCount(0);
  });

  await test.step("la ✕ quita un filtro y 'Quitar todo' los quita todos", async () => {
    await visible(page.getByRole("link", { name: /^Quitar filtro: Desde el/ })).click();
    await expect(summary(page, "2 eventos")).toBeVisible();
    await visible(page.getByRole("link", { name: "Quitar todo" })).click();
    await expect(page).toHaveURL(/\/admin\/historial$/);
    await expect(search(page)).toHaveValue("");
    await expect(filtersButton(page)).toHaveAccessibleName("Filtros");
  });

  await test.step("tocar el nombre de una persona muestra solo sus eventos", async () => {
    await visible(page.getByRole("link", { name: "Beto Historial" })).first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(betoEmail);
    await expect(summary(page, "3 eventos")).toBeVisible();
    await expect(search(page)).toHaveValue(betoEmail);
  });

  await beto.context().close();
});

test("'Ver más antiguos' suma los siguientes 50 y conserva los filtros", async ({ page }) => {
  // 60 intentos fallidos con un prefijo de número propio de esta prueba.
  const prefix = `5739${randomInt(10_000, 99_999)}`;
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`
    insert into account_event (type, phone, details, created_at)
    select 'whatsapp_link_failed', ${prefix} || lpad(g::text, 3, '0'), '{"reason": "invalid_code"}'::jsonb,
           now() - g * interval '1 minute'
    from generate_series(1, 60) g`;
  await sql.end();

  await adminReady(page);
  await searchFor(page, prefix);
  await expect(summary(page, "60 eventos")).toBeVisible();
  await expect(events(page)).toHaveCount(50);
  await expect(events(page).first()).toContainText(formatted(`${prefix}001`));

  await visible(page.getByRole("link", { name: "Ver más antiguos" })).click();
  await expect(page).toHaveURL(/mostrar=100/);
  await expect(events(page)).toHaveCount(60);
  await expect(events(page).first()).toContainText(formatted(`${prefix}001`));
  await expect(events(page).last()).toContainText(formatted(`${prefix}060`));
  await expect(page.getByRole("link", { name: "Ver más antiguos" })).toHaveCount(0);
  await expect(search(page)).toHaveValue(prefix);
});

test("en celular se ve sin desplazamiento lateral y sin problemas de accesibilidad, con el panel abierto", async ({ page }) => {
  await adminReady(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(heading(page, "Registro y vinculación de WhatsApp")).toBeVisible();
  await filtersButton(page).click();
  await expect(visible(page.getByText("Vinculaciones", { exact: true }))).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
});

test("en modo oscuro tampoco hay problemas de accesibilidad", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await adminReady(page);
  await expect(events(page).first()).toBeVisible();
  await filtersButton(page).click();
  expect(await seriousViolations(page)).toEqual([]);
});

test("filtros raros en la URL no rompen la página ni muestran datos de más", async ({ page }) => {
  await adminReady(page);
  // Por la ruta vieja (/admin?…): se redirige al Historial con los mismos parámetros.
  for (const query of [
    "?tipo=otra_cosa&tipo=__proto__&mostrar=-5",
    "?fecha=personalizado&desde=2026-02-31&hasta=ayer",
    `?q=${encodeURIComponent("' or '1'='1")}`,
    `?q=${"a".repeat(500)}&mostrar=999999&fecha=7D`,
  ]) {
    const response = await page.goto(`/admin${query}`);
    expect(response?.status(), query).toBe(200);
    await expect(page, query).toHaveURL(/\/admin\/historial\?/);
    await expect(heading(page, "Registro y vinculación de WhatsApp"), query).toBeVisible();
  }
  await page.goto(`/admin?q=${encodeURIComponent("' or '1'='1")}`);
  await expect(summary(page, "No hay eventos con estos filtros.")).toBeVisible();
});

test("un usuario normal no ve la página, ni con filtros en la URL", async ({ page }) => {
  await register(page);
  await expect(adminTab(page)).toHaveCount(0);
  await page.goto("/admin?tipo=registered&q=a&fecha=hoy");
  await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Buscar" })).toHaveCount(0);
});

test("la política de privacidad explica qué ve el administrador", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(page.getByText(/el administrador de la app puede ver el historial/)).toBeVisible();
  await expect(page.getByText(/No ve tus ingresos, egresos ni\s+mensajes/)).toBeVisible();
  await expect(page.getByText(/Los intentos de vinculación desde números que no tienen\s+cuenta se borran a los 30 días/)).toBeVisible();
});
