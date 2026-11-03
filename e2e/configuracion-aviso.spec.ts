import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { newPerson, register, test, toast, visible } from "./helpers";

// El aviso para todos (/admin/configuracion), de punta a punta: publicarlo, verlo en la app, el login y el
// registro (también en inglés), cerrarlo con la ✕, que vuelva si se publica otro, quitarlo y que uno vencido no se
// vea. Cambia lo que ve toda la app, así que corre en el proyecto "configuracion" (playwright.config.ts), un archivo
// a la vez y nunca a la vez que las demás pruebas. Cada prueba empieza sin aviso (beforeEach) y lo deja así al final.
test.describe.configure({ mode: "default" });

async function clearNotice() {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`delete from app_notice`;
  await sql.end();
}
test.beforeEach(clearNotice);
test.afterAll(clearNotice);

const card = (page: Page) => visible(page.getByRole("region", { name: "Aviso para todos" }));
const dialog = (page: Page) => page.getByRole("dialog");
const banner = (page: Page, name = "Aviso importante") => visible(page.getByRole("region", { name }));
/** El código de ahora o, para la segunda acción seguida, el del período siguiente (un código sirve una vez). */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

async function adminOnSettings(page: Page) {
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto("/admin/configuracion");
  await expect(heading(page, "Aviso para todos")).toBeVisible();
  return secret;
}

async function publish(page: Page, { message, messageEn = "", tone, code }: { message: string; messageEn?: string; tone: RegExp; code: string }) {
  await card(page).getByRole("button", { name: /^(Publicar un aviso|Cambiar el aviso)$/ }).click();
  await dialog(page).getByLabel("Aviso", { exact: true }).fill(message);
  await dialog(page).getByLabel(/^Aviso en inglés/).fill(messageEn);
  await dialog(page).getByRole("radio", { name: tone }).check();
  await dialog(page).getByLabel("Código de Google Authenticator").fill(code);
  await dialog(page).getByRole("button", { name: "Publicar", exact: true }).click();
}

test("el admin publica un aviso: se ve en la app, el login y el registro, se cierra con la ✕ y vuelve si se cambia", async ({ page, browser }) => {
  const beto = await newPerson(browser);
  await register(beto, "Beto Aviso");
  const secret = await adminOnSettings(page);
  await expect(card(page)).toContainText("No hay ningún aviso.");

  await test.step("publicarlo, con el inglés, pide el código y queda a la vista en Configuración", async () => {
    await publish(page, {
      message: "Mantenimiento el sábado de 8 a 9: la app no estará disponible.",
      messageEn: "Maintenance on Saturday from 8 to 9: the app won't be available.",
      tone: /^Importante/,
      code: codeFor(secret),
    });
    await expect(toast(page, /^Se publicó el aviso: se ve hasta el /)).toBeFocused();
    await expect(card(page).getByRole("region", { name: "Aviso importante" })).toContainText("Mantenimiento el sábado de 8 a 9");
    await expect(card(page)).toContainText("Importante · Se ve hasta el");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("Beto lo ve arriba de la app, también al cambiar de página", async () => {
    await beto.goto("/dashboard");
    await expect(banner(beto)).toContainText("Mantenimiento el sábado de 8 a 9: la app no estará disponible.");
    expect(await seriousViolations(beto)).toEqual([]);
    await beto.emulateMedia({ colorScheme: "dark" });
    expect(await seriousViolations(beto)).toEqual([]);
    await beto.emulateMedia({ colorScheme: "light" });
    await beto.goto("/egresos");
    await expect(banner(beto)).toBeVisible();
    // En el celular más angosto, el texto se parte en líneas sin mover la página de lado.
    await beto.setViewportSize({ width: 320, height: 700 });
    await expect(banner(beto)).toBeVisible();
    expect(await beto.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await beto.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step("sin sesión, en el login y el registro; en inglés, el texto en inglés", async () => {
    const visitor = await newPerson(browser);
    await visitor.goto("/login");
    await expect(banner(visitor)).toContainText("Mantenimiento el sábado");
    await visitor.goto("/registro");
    await expect(banner(visitor)).toContainText("Mantenimiento el sábado");
    expect(await seriousViolations(visitor)).toEqual([]);
    await visitor.getByRole("button", { name: "English" }).click();
    await expect(banner(visitor, "Important notice")).toContainText("Maintenance on Saturday from 8 to 9: the app won't be available.");
    await visitor.context().close();
  });

  await test.step("Beto lo cierra: no vuelve al recargar ni en otra página", async () => {
    await banner(beto).getByRole("button", { name: "Ocultar este aviso" }).click();
    await expect(banner(beto)).toHaveCount(0);
    await beto.reload();
    await expect(visible(beto.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(banner(beto)).toHaveCount(0);
    await beto.goto("/dashboard");
    await expect(banner(beto)).toHaveCount(0);
  });

  await test.step("el admin lo cambia: es otro, y Beto lo vuelve a ver", async () => {
    await publish(page, { message: "Nuevo: los presupuestos están en Configuración.", tone: /^Información/, code: codeFor(secret, 1) });
    await expect(toast(page, /^Se publicó el aviso/)).toBeFocused();
    await beto.reload();
    await expect(banner(beto, "Aviso general")).toContainText("Nuevo: los presupuestos están en Configuración.");
    await expect(banner(beto)).toHaveCount(0);
  });

  await test.step("Inicio y el historial lo muestran", async () => {
    await page.goto("/admin");
    await expect(visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem").filter({ hasText: "Configuración" })).toContainText(
      /Registros abiertos · Aviso hasta el /,
    );
    await page.goto("/admin/historial?tipo=admin");
    const item = visible(page.getByRole("listitem").filter({ hasText: "Ana Admin publicó un aviso para todos" })).first();
    await expect(item).toContainText("Configuración · “Nuevo: los presupuestos están en Configuración.” · información · hasta el");
  });
  await beto.context().close();
});

test("quitarlo: deja de verse de inmediato; uno vencido no se ve", async ({ page, browser }) => {
  const beto = await newPerson(browser);
  await register(beto, "Beto Aviso");
  const secret = await adminOnSettings(page);
  await publish(page, { message: "Falla en el bot: ya lo estamos arreglando.", tone: /^Importante/, code: codeFor(secret) });
  await expect(toast(page, /^Se publicó el aviso/)).toBeVisible();
  await beto.goto("/dashboard");
  await expect(banner(beto)).toContainText("Falla en el bot");

  await test.step("con el código lo quita", async () => {
    await card(page).getByRole("button", { name: "Quitar el aviso" }).click();
    await dialog(page).getByLabel("Código de Google Authenticator").fill(codeFor(secret, 1));
    await dialog(page).getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(toast(page, "Se quitó el aviso para todos.")).toBeFocused();
    await expect(card(page)).toContainText("No hay ningún aviso.");
    await beto.reload();
    await expect(visible(beto.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(banner(beto)).toHaveCount(0);
  });

  await test.step("uno vencido sigue en Configuración, en rojo, pero no se ve en la app", async () => {
    const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
    await sql`insert into app_notice (id, message, tone, ends_at) values (1, 'Mantenimiento de ayer', 'important', now() - interval '1 hour')`;
    await sql.end();
    await page.reload();
    await expect(card(page)).toContainText("Mantenimiento de ayer");
    await expect(card(page).getByText(/^Importante · Venció el /)).toBeVisible();
    await beto.reload();
    await expect(visible(beto.getByRole("heading", { level: 1 }))).toBeVisible();
    await expect(banner(beto)).toHaveCount(0);
  });
  await beto.context().close();
});
