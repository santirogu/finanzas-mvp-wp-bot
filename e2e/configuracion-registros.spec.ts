import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { formAlert, newPerson, PASSWORD, register, test, toast, uniqueEmail, visible } from "./helpers";

// Quién puede crear una cuenta (/admin/configuracion), de punta a punta: cerrar los registros, dejarlos solo con
// invitación y lo que ve quien intenta registrarse. Cambia la configuración de toda la app, así que corre en el
// proyecto "configuracion" (playwright.config.ts), un archivo a la vez y nunca a la vez que las demás pruebas
// (que crean cuentas). Sus pruebas van una después de otra y cada una empieza con los registros abiertos y sin
// invitados (beforeEach): si una se cae a mitad de camino, las que siguen no dependen de lo que dejó.
test.describe.configure({ mode: "default" });

async function resetSignups() {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  // Sin fila, los registros están abiertos (como siempre).
  await sql`delete from app_setting`;
  await sql`delete from signup_invite`;
  await sql.end();
}
test.beforeEach(resetSignups);
// Al terminar, abiertos: las pruebas que vengan después crean cuentas.
test.afterAll(resetSignups);

const signups = (page: Page) => visible(page.getByRole("region", { name: "Registros" }));
const dialog = (page: Page) => page.getByRole("dialog");
const invites = (page: Page) => visible(page.getByRole("list", { name: "Correos invitados" }));
/** El código de ahora o, para la segunda acción seguida, el del período siguiente (un código sirve una vez). */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

async function adminOnSettings(page: Page) {
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto("/admin/configuracion");
  await expect(heading(page, "Registros")).toBeVisible();
  return secret;
}

async function changeMode(page: Page, option: RegExp, code: string) {
  await signups(page).getByRole("button", { name: "Cambiar quién puede crear una cuenta" }).click();
  await dialog(page).getByRole("radio", { name: option }).check();
  await dialog(page).getByLabel("Código de Google Authenticator").fill(code);
  await dialog(page).getByRole("button", { name: "Cambiar", exact: true }).click();
}

/** Intenta crear una cuenta (sin esperar al dashboard). */
async function trySignUp(page: Page, email: string) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill("Beto Nuevo");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

test("el admin cierra los registros: /registro lo avisa, no deja crear la cuenta y queda en el historial", async ({ page, browser }) => {
  const secret = await adminOnSettings(page);
  await expect(signups(page)).toContainText("Abiertos");
  await expect(signups(page)).toContainText("Sin cambios: abiertos, como siempre.");
  expect(await seriousViolations(page)).toEqual([]);

  await test.step("con el código, los cierra", async () => {
    await signups(page).getByRole("button", { name: "Cambiar quién puede crear una cuenta" }).click();
    await expect(dialog(page).getByRole("radio", { name: /^Abiertos \(los de ahora\)/ })).toBeChecked();
    expect(await seriousViolations(page)).toEqual([]);
    await dialog(page).getByRole("button", { name: "Cancelar" }).click();
    await changeMode(page, /^Cerrados/, codeFor(secret));
    await expect(toast(page, "Los registros quedaron cerrados: nadie puede crear una cuenta nueva.")).toBeFocused();
    await expect(signups(page)).toContainText("CerradosNadie puede crear una cuenta nueva.");
    await expect(signups(page)).toContainText(/Último cambio: Ana Admin · /);
  });

  await test.step("quien intenta registrarse ve el aviso con el correo de contacto, y el servidor lo rechaza", async () => {
    const visitor = await newPerson(browser);
    await visitor.goto("/registro");
    const notice = visible(visitor.getByRole("status").filter({ hasText: "Por ahora los registros están cerrados" }));
    await expect(notice.getByRole("link")).toHaveAttribute("href", /^mailto:/);
    expect(await seriousViolations(visitor)).toEqual([]);
    const email = uniqueEmail();
    await trySignUp(visitor, email);
    await expect(formAlert(visitor)).toContainText("Por ahora los registros están cerrados. Si quieres una cuenta, escríbenos a");
    await expect(visitor).toHaveURL(/\/registro$/);
    await visitor.context().close();
  });

  await test.step("Inicio y el historial lo muestran", async () => {
    await page.goto("/admin");
    await expect(visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem").filter({ hasText: "Configuración" })).toContainText(
      "Registros cerrados",
    );
    await page.goto("/admin/historial?tipo=admin");
    const item = visible(page.getByRole("listitem").filter({ hasText: "Ana Admin cambió quién puede crear una cuenta" })).first();
    await expect(item).toContainText("Configuración · ahora cerrados (antes abiertos)");
  });
});

test("solo con invitación: el invitado crea su cuenta y queda como usada; otro correo no puede", async ({ page, browser }) => {
  const secret = await adminOnSettings(page);
  const invited = uniqueEmail();
  const other = uniqueEmail();

  await test.step("invita dos correos sin código (el error de un correo mal escrito va debajo del campo)", async () => {
    const field = signups(page).getByLabel("Correo", { exact: true });
    await field.fill("no-es-correo");
    await signups(page).getByRole("button", { name: "Invitar" }).click();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(signups(page).getByText("Revisa el correo: debe verse como nombre@correo.com.")).toBeVisible();

    await field.fill(invited.toUpperCase());
    await signups(page).getByRole("button", { name: "Invitar" }).click();
    await expect(toast(page, `Se invitó a ${invited}`)).toBeVisible();
    // El foco sigue en el formulario, para invitar otro.
    await expect(field).toHaveValue("");
    await field.fill(other);
    await signups(page).getByRole("button", { name: "Invitar" }).click();
    await expect(toast(page, `Se invitó a ${other}`)).toBeVisible();
    await expect(invites(page).getByRole("listitem")).toHaveCount(2);
    await expect(invites(page).getByRole("listitem").filter({ hasText: invited })).toContainText("Pendiente · invitado el");

    // Ya invitado: lo dice debajo del campo.
    await field.fill(invited);
    await signups(page).getByRole("button", { name: "Invitar" }).click();
    await expect(signups(page).getByText("Ese correo ya está invitado.")).toBeVisible();
    await field.fill("");
  });

  await test.step("con el código, solo con invitación", async () => {
    await changeMode(page, /^Solo con invitación/, codeFor(secret));
    await expect(toast(page, "Ahora solo se puede crear una cuenta con invitación.")).toBeFocused();
    await expect(signups(page)).toContainText("Solo estos correos pueden crear una cuenta.");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("un correo sin invitación no puede; el invitado sí", async () => {
    const visitor = await newPerson(browser);
    await visitor.goto("/registro");
    await expect(visible(visitor.getByRole("status").filter({ hasText: "solo se puede crear una cuenta con invitación" }))).toBeVisible();
    await trySignUp(visitor, uniqueEmail());
    await expect(formAlert(visitor)).toContainText("ese correo no está invitado");
    await register(visitor, "Beto Invitado", invited);
    await visitor.context().close();
  });

  await test.step("la invitación queda como usada; Inicio cuenta la pendiente; quitar la otra", async () => {
    await page.reload();
    await expect(invites(page).getByRole("listitem").filter({ hasText: invited })).toContainText("Creó su cuenta el");
    await page.goto("/admin");
    await expect(visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem").filter({ hasText: "Configuración" })).toContainText(
      "Registros solo con invitación · 1 invitación pendiente",
    );
    await page.goto("/admin/configuracion");
    await signups(page).getByRole("button", { name: `Quitar la invitación de ${other}` }).click();
    await expect(toast(page, `Se quitó la invitación de ${other}`)).toBeFocused();
    await expect(invites(page).getByRole("listitem")).toHaveCount(1);
  });

  await test.step("el historial: quién invitó y quitó a quién", async () => {
    await page.goto("/admin/historial?tipo=admin");
    await expect(visible(page.getByText(`Ana Admin invitó a ${invited} a crear una cuenta`))).toBeVisible();
    await expect(visible(page.getByText(`Ana Admin quitó la invitación de ${other}`))).toBeVisible();
  });
});
