import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { fakeIp, goToWhatsApp, register, test, uniqueEmail, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// Usuarios en la administración: la lista de cuentas con búsqueda y filtros en chips, y el detalle
// de cada una (datos, sesiones abiertas con navegador e IP, y eventos). Las pruebas corren en
// paralelo sobre la misma base: cada una busca sus propias cuentas por correo.

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const formatted = (phone: string) => `+57 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
const search = (page: Page) => visible(page.getByRole("searchbox", { name: "Buscar" }));
const filtersButton = (page: Page) => visible(page.getByRole("button", { name: /^Filtros/ }));
const summary = (page: Page, text: string) => visible(page.getByText(text, { exact: true }));
const accounts = (page: Page) => visible(page.getByRole("list", { name: "Cuentas" })).getByRole("listitem");
const sessions = (page: Page) => visible(page.getByRole("list", { name: "Sesiones abiertas" })).getByRole("listitem");
const events = (page: Page) => visible(page.locator("main ol > li"));
const subnavChip = (page: Page, name: string) =>
  visible(page.getByRole("navigation", { name: "Secciones de administración" }).getByRole("link", { name, exact: true }));
/** Un dato del detalle: la etiqueta (dt) y su valor (dd). */
const field = (page: Page, label: string) =>
  visible(page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]"));

/** Un admin con la verificación lista, en Usuarios (desde la subnavegación). */
async function adminInUsers(page: Page) {
  const email = await newAdmin(page);
  await setUpTwoFactor(page);
  await subnavChip(page, "Usuarios").click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  await expect(heading(page, "Cuentas")).toBeVisible();
  return email;
}

async function searchFor(page: Page, text: string) {
  await search(page).fill(text);
  await search(page).press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(text);
}

/** Abre el panel (si está cerrado) y toca un chip de un grupo; espera a que se aplique. */
async function toggleChip(page: Page, group: string, name: string, role: "checkbox" | "radio") {
  if ((await filtersButton(page).getAttribute("aria-expanded")) !== "true") await filtersButton(page).click();
  const before = page.url();
  const fieldset = visible(page.getByRole("group", { name: group }));
  // La casilla es invisible (sr-only): se toca su etiqueta, como una persona.
  await fieldset.locator("label").filter({ has: page.getByRole(role, { name, exact: true }) }).click();
  await expect(page).not.toHaveURL(before);
}

test("el admin encuentra una cuenta y ve su detalle: WhatsApp, sesión con navegador e IP, y eventos @principal", async ({
  page,
  browser,
  request,
}) => {
  // Beto entra desde un iPhone con IPv6 (Better Auth guarda solo la red, /64) y vincula su WhatsApp.
  const [a, b] = [randomInt(1, 0x10000).toString(16), randomInt(1, 0x10000).toString(16)];
  const beto = await (
    await browser.newContext({ userAgent: IPHONE_SAFARI, extraHTTPHeaders: { "x-forwarded-for": `2001:db8:${a}:${b}:abcd:1234:5678:9abc` } })
  ).newPage();
  const betoEmail = uniqueEmail();
  const betoPhone = newPhone();
  await register(beto, "Beto Usuarios", betoEmail);
  await goToWhatsApp(beto);
  await beto.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(beto.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, betoPhone, `VINCULAR ${code}`);
  await nthReply(request, betoPhone, 1);

  await adminInUsers(page);

  await test.step("la búsqueda por correo encuentra la cuenta, con su WhatsApp", async () => {
    await searchFor(page, betoEmail);
    await expect(summary(page, "1 cuenta")).toBeVisible();
    await expect(accounts(page)).toHaveCount(1);
    await expect(accounts(page).first()).toContainText("Beto Usuarios");
    await expect(accounts(page).first()).toContainText(betoEmail);
    await expect(accounts(page).first()).toContainText(`WhatsApp ${formatted(betoPhone)}`);
    await expect(accounts(page).first()).not.toContainText("Admin");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("el detalle muestra sus datos, su sesión y sus eventos", async () => {
    await accounts(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
    await expect(heading(page, /Beto Usuarios/)).toBeVisible();
    await expect(subnavChip(page, "Usuarios")).toHaveAttribute("aria-current", "page");
    await expect(field(page, "Rol")).toHaveText("Usuario");
    await expect(field(page, "WhatsApp")).toContainText(formatted(betoPhone));
    await expect(field(page, "Bloqueo")).toHaveText("Sin bloqueo");
    await expect(field(page, "Último inicio de sesión")).not.toHaveText("Sin sesiones guardadas");
    // La verificación en dos pasos solo aparece en las cuentas de admin.
    await expect(page.locator("dt", { hasText: "Verificación en dos pasos" })).toHaveCount(0);

    await expect(summary(page, "1 sesión · la más reciente primero")).toBeVisible();
    await expect(sessions(page).first()).toContainText("Safari · iOS");
    await expect(sessions(page).first()).toContainText(`IP 2001:db8:${a}:${b}::/64`);

    await expect(events(page)).toHaveCount(3);
    await expect(events(page).nth(0)).toContainText(`Beto Usuarios vinculó su WhatsApp ${formatted(betoPhone)}`);
    await expect(events(page).nth(1)).toContainText("Beto Usuarios pidió un código para vincular su WhatsApp");
    await expect(events(page).nth(2)).toContainText("Beto Usuarios se registró");
    // Nada de montos, movimientos ni mensajes.
    await expect(visible(page.getByText(/\$\s?\d/))).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("desde el detalle se llega a su historial completo y de vuelta a la lista", async () => {
    await visible(page.getByRole("link", { name: "Ver todo su historial" })).click();
    await expect(page).toHaveURL(/\/admin\/historial\?q=/);
    await expect(summary(page, "3 eventos")).toBeVisible();
    await page.goBack();
    await visible(page.getByRole("link", { name: "Todas las cuentas" })).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
  });

  await beto.context().close();
});

test("los filtros de rol, WhatsApp, bloqueo y fecha se combinan con la búsqueda y se quitan con su ✕", async ({ page, browser }) => {
  // Carla tiene el inicio de sesión bloqueado por intentos fallidos (se simula en la base: con la
  // contraseña equivocada cinco veces, el límite por IP la frenaría antes).
  const carla = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } })).newPage();
  const carlaEmail = uniqueEmail();
  await register(carla, "Carla Bloqueada", carlaEmail);
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`
    insert into login_failure (email, failures, first_failure_at, locked_until)
    values (${carlaEmail}, 5, now(), now() + interval '15 minutes')`;
  await sql.end();

  const adminEmail = await adminInUsers(page);

  await test.step("rol: el admin aparece con su etiqueta; con el chip Usuario, no", async () => {
    await searchFor(page, adminEmail);
    await expect(accounts(page).first()).toContainText("Admin");
    await toggleChip(page, "Rol", "Usuario", "radio");
    await expect(summary(page, "No hay cuentas con estos filtros.")).toBeVisible();
    await toggleChip(page, "Rol", "Admin", "radio");
    await expect(summary(page, "1 cuenta")).toBeVisible();
    await expect(filtersButton(page)).toHaveAccessibleName("Filtros (activos: 2)");
    await visible(page.getByRole("link", { name: "Quitar filtro: Rol: Admin" })).click();
    await expect(page).not.toHaveURL(/rol=/);
    await expect(summary(page, "1 cuenta")).toBeVisible();
  });

  await test.step("el detalle del admin muestra su rol y la verificación activa", async () => {
    await accounts(page).first().getByRole("link").click();
    await expect(field(page, "Rol")).toHaveText("Administrador");
    await expect(field(page, "Verificación en dos pasos")).toHaveText("Activa");
    await expect(sessions(page)).toHaveCount(1);
    await page.goBack();
  });

  await test.step("bloqueo y WhatsApp", async () => {
    await searchFor(page, carlaEmail);
    await expect(accounts(page).first()).toContainText(/Bloqueada hasta las/);
    await expect(accounts(page).first()).toContainText("Sin WhatsApp");
    await toggleChip(page, "Estado", "Inicio de sesión bloqueado", "checkbox");
    await expect(summary(page, "1 cuenta")).toBeVisible();
    await toggleChip(page, "WhatsApp", "Vinculado", "radio");
    await expect(summary(page, "No hay cuentas con estos filtros.")).toBeVisible();
    await toggleChip(page, "WhatsApp", "Sin vincular", "radio");
    await toggleChip(page, "Fecha de registro", "Hoy", "radio");
    await expect(summary(page, "1 cuenta")).toBeVisible();
    for (const label of ["WhatsApp: sin vincular", "Inicio de sesión bloqueado", "Registro: Hoy", `“${carlaEmail}”`]) {
      await expect(visible(page.getByRole("link", { name: `Quitar filtro: ${label}` })), label).toBeVisible();
    }
    // En el detalle, hasta cuándo.
    await accounts(page).first().getByRole("link").click();
    await expect(field(page, "Bloqueo")).toContainText("Inicio de sesión bloqueado por intentos fallidos hasta las");
    await page.goBack();
  });

  await test.step("'Quitar todo' vuelve a la lista sin filtros", async () => {
    await visible(page.getByRole("link", { name: "Quitar todo" })).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await expect(filtersButton(page)).toHaveAccessibleName("Filtros");
    await expect(search(page)).toHaveValue("");
  });

  await carla.context().close();
});

test("'Ver más cuentas' suma de a 50, conserva la búsqueda y para en 500", async ({ page }) => {
  // 501 cuentas con un prefijo propio de esta prueba, de la más nueva (001) a la más vieja (501).
  const prefix = `lote${randomInt(10_000, 99_999)}`;
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`
    insert into "user" (id, name, email, created_at)
    select ${prefix} || '-' || lpad(g::text, 3, '0'), 'Cuenta ' || ${prefix} || ' ' || lpad(g::text, 3, '0'),
           ${prefix} || '-' || g || '@finanzas-e2e.test', now() - g * interval '1 minute'
    from generate_series(1, 501) g`;
  await sql.end();

  await adminInUsers(page);
  await searchFor(page, prefix);
  await expect(summary(page, "501 cuentas")).toBeVisible();
  await expect(accounts(page)).toHaveCount(50);
  await expect(accounts(page).first()).toContainText(`Cuenta ${prefix} 001`);
  await expect(accounts(page).last()).toContainText(`Cuenta ${prefix} 050`);

  await visible(page.getByRole("link", { name: "Ver más cuentas" })).click();
  await expect(page).toHaveURL(/mostrar=100/);
  await expect(accounts(page)).toHaveCount(100);
  await expect(accounts(page).last()).toContainText(`Cuenta ${prefix} 100`);
  await expect(search(page)).toHaveValue(prefix);

  // En el tope: 500 y un aviso en vez del botón.
  await page.goto(`/admin/usuarios?q=${prefix}&mostrar=500`);
  await expect(accounts(page)).toHaveCount(500);
  await expect(accounts(page).last()).toContainText(`Cuenta ${prefix} 500`);
  await expect(summary(page, "Se muestran las 500 más nuevas: usa los filtros para encontrar las demás.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver más cuentas" })).toHaveCount(0);
});

test("ids raros o de cuentas que no existen dan 404; filtros raros no rompen la lista", async ({ page }) => {
  await adminInUsers(page);
  for (const id of ["no-existe", encodeURIComponent("' or 1=1 --"), "a".repeat(80), "%00"]) {
    await page.goto(`/admin/usuarios/${id}`);
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" })), id).toBeVisible();
  }
  for (const query of [
    "?rol=superadmin&whatsapp=quizas&estado=__proto__&mostrar=-5",
    "?fecha=personalizado&desde=2026-02-31&hasta=ayer",
    `?q=${encodeURIComponent("' or '1'='1")}`,
    "?q=%00",
    `?q=${"a".repeat(500)}&mostrar=999999`,
  ]) {
    const response = await page.goto(`/admin/usuarios${query}`);
    expect(response?.status(), query).toBe(200);
    await expect(heading(page, "Cuentas"), query).toBeVisible();
  }
});

test("a un usuario normal no le llega nada de Usuarios", async ({ page }) => {
  await register(page);
  for (const path of ["/admin/usuarios", "/admin/usuarios?rol=admin", "/admin/usuarios/cualquiera"]) {
    const response = await page.goto(path);
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" })), path).toBeVisible();
    const html = (await response!.text()) + (await page.content());
    for (const text of ["Cuentas", "Sesiones abiertas", "Todas las cuentas", "Fecha de registro"]) {
      expect(html, `${path}: ${text}`).not.toContain(text);
    }
  }
});

test("en celular, la lista y el detalle se ven sin desplazamiento lateral y sin problemas de accesibilidad", async ({ page }) => {
  const email = await adminInUsers(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  await filtersButton(page).click();
  await expect(visible(page.getByRole("group", { name: "Fecha de registro" }))).toBeVisible();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);

  await searchFor(page, email);
  await accounts(page).first().getByRole("link").click();
  await expect(visible(page.getByRole("heading", { name: "Sesiones abiertas" }))).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
});

test("en modo oscuro, la lista y el detalle no tienen problemas de accesibilidad", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const email = await adminInUsers(page);
  await searchFor(page, email);
  await filtersButton(page).click();
  expect(await seriousViolations(page)).toEqual([]);
  await accounts(page).first().getByRole("link").click();
  await expect(visible(page.getByRole("heading", { name: "Sesiones abiertas" }))).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
