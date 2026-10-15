import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { adminTab, heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { newPerson, register, test, uniqueEmail, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// La página de administración: el historial de registro y vinculación de todas las cuentas. Las
// pruebas corren en paralelo sobre la misma base, así que cada una busca lo suyo (correo o número
// únicos) en vez de contar todo lo que hay.

const formatted = (phone: string) => `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
const rows = (page: Page) => visible(page.getByRole("table")).getByRole("row").filter({ has: page.getByRole("cell") });

/** Un admin con la verificación lista, en /admin. */
async function adminReady(page: Page) {
  await newAdmin(page);
  await setUpTwoFactor(page);
}

async function filter(page: Page, values: { tipo?: string; q?: string; desde?: string; hasta?: string }) {
  // visible(): Next deja montadas, ocultas, las páginas ya visitadas (ver e2e/helpers.ts).
  if (values.tipo !== undefined) await visible(page.getByRole("combobox", { name: "Evento" })).selectOption({ label: values.tipo });
  if (values.q !== undefined) await visible(page.getByLabel("Buscar")).fill(values.q);
  if (values.desde !== undefined) await visible(page.getByLabel("Desde")).fill(values.desde);
  if (values.hasta !== undefined) await visible(page.getByLabel("Hasta")).fill(values.hasta);
  await visible(page.getByRole("button", { name: "Filtrar" })).click();
}

/** Día (YYYY-MM-DD) en Colombia, desplazado `days` días desde hoy. */
const bogotaDay = (days = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(Date.now() + days * 86_400_000));

test("el admin ve el registro, la vinculación y los intentos fallidos de otras cuentas, y los filtra", async ({ page, browser, request }) => {
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

  await test.step("buscar por correo muestra el historial de esa cuenta, del más nuevo al más viejo", async () => {
    await filter(page, { q: betoEmail });
    // Formulario GET (sirve sin JavaScript): los filtros quedan en la URL.
    expect(new URL(page.url()).searchParams.get("q")).toBe(betoEmail);
    await expect(page.getByText("3 eventos · página 1 de 1")).toBeVisible();
    await expect(rows(page).nth(0)).toContainText("WhatsApp vinculado");
    await expect(rows(page).nth(0)).toContainText(formatted(betoPhone));
    await expect(rows(page).nth(1)).toContainText("Código para vincular");
    await expect(rows(page).nth(2)).toContainText("Registro");
    for (let i = 0; i < 3; i++) {
      await expect(rows(page).nth(i)).toContainText("Beto Historial");
      await expect(rows(page).nth(i)).toContainText(betoEmail);
    }
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("buscar por número (escrito como sea) encuentra el intento fallido sin cuenta", async () => {
    await filter(page, { q: formatted(strangerPhone) });
    await expect(page.getByText("1 evento · página 1 de 1")).toBeVisible();
    await expect(rows(page).first()).toContainText("Intento fallido de vinculación");
    await expect(rows(page).first()).toContainText("código inválido o vencido");
    await expect(rows(page).first()).toContainText("Sin cuenta");
  });

  await test.step("filtrar por tipo y por fechas", async () => {
    await filter(page, { tipo: "WhatsApp vinculado", q: betoEmail });
    await expect(page.getByText("1 evento · página 1 de 1")).toBeVisible();
    await expect(visible(page.getByRole("combobox", { name: "Evento" }))).toHaveValue("whatsapp_linked");

    await filter(page, { tipo: "Todos", q: betoEmail, desde: bogotaDay(), hasta: bogotaDay() });
    await expect(page.getByText("3 eventos · página 1 de 1")).toBeVisible();
    await filter(page, { desde: bogotaDay(1), hasta: bogotaDay(1) });
    await expect(page.getByText("No hay eventos con estos filtros.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await page.getByRole("link", { name: "Quitar filtros" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(visible(page.getByLabel("Buscar"))).toHaveValue("");
  });

  await beto.context().close();
});

test("pagina de a 50 con enlaces que conservan los filtros", async ({ page }) => {
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
  await filter(page, { q: prefix });
  await expect(page.getByText("60 eventos · página 1 de 2")).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await expect(rows(page).first()).toContainText(formatted(`${prefix}001`));
  await expect(page.getByRole("link", { name: "← Más recientes" })).toHaveCount(0);

  await page.getByRole("link", { name: "Más antiguos →" }).click();
  await expect(page).toHaveURL(new RegExp(`q=${prefix}.*pagina=2`));
  await expect(page.getByText("60 eventos · página 2 de 2")).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).last()).toContainText(formatted(`${prefix}060`));
  await expect(page.getByRole("link", { name: "Más antiguos →" })).toHaveCount(0);

  await page.getByRole("link", { name: "← Más recientes" }).click();
  await expect(page.getByText("60 eventos · página 1 de 2")).toBeVisible();
});

test("en celular la tabla se desliza dentro de la tarjeta, sin mover la página de lado", async ({ page }) => {
  await adminReady(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload();
  await expect(heading(page, "Registro y vinculación de WhatsApp")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
});

test("en modo oscuro la página de administración tampoco tiene problemas de accesibilidad", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await adminReady(page);
  await expect(rows(page).first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("filtros raros en la URL no rompen la página ni muestran datos de más", async ({ page }) => {
  await adminReady(page);
  for (const query of [
    "?tipo=otra_cosa&pagina=-5",
    "?desde=2026-02-31&hasta=ayer",
    `?q=${encodeURIComponent("' or '1'='1")}`,
    `?q=${"a".repeat(500)}&pagina=999999`,
  ]) {
    const response = await page.goto(`/admin${query}`);
    expect(response?.status(), query).toBe(200);
    await expect(heading(page, "Administración"), query).toBeVisible();
  }
  await page.goto(`/admin?q=${encodeURIComponent("' or '1'='1")}`);
  await expect(page.getByText("No hay eventos con estos filtros.")).toBeVisible();
});

test("un usuario normal no ve la página, ni con filtros en la URL", async ({ page }) => {
  await register(page);
  await expect(adminTab(page)).toHaveCount(0);
  await page.goto("/admin?tipo=registered&q=a");
  await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("la política de privacidad explica qué ve el administrador", async ({ page }) => {
  await page.goto("/privacidad");
  await expect(page.getByText(/el administrador de la app puede ver el historial/)).toBeVisible();
  await expect(page.getByText(/No ve tus ingresos, egresos ni\s+mensajes/)).toBeVisible();
  await expect(page.getByText(/Los intentos de vinculación desde números que no tienen\s+cuenta se borran a los 30 días/)).toBeVisible();
});
