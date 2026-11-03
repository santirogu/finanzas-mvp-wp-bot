import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { PRIVACY_VERSION } from "../src/lib/privacy";
import { seriousViolations } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { PASSWORD, register, test, visible, withoutPrivacyConsent } from "./helpers";

// La autorización para tratar los datos (Ley 1581, src/lib/privacy.ts): una cuenta que no la tiene (las de antes
// de pedirla) no usa nada de la app hasta darla en /autorizacion; si no quiere, cierra sesión o elimina su cuenta.

const box = (page: Page) => visible(page.getByRole("checkbox", { name: /^Autorizo el tratamiento de mis datos personales/ }));

async function consentOf(email: string) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  const [row] = await sql<{ version: string | null }[]>`select privacy_version as version from "user" where email = ${email}`;
  await sql.end();
  return row?.version;
}

test("una cuenta sin la autorización va a darla: no entra a nada hasta marcar la casilla; después, al Resumen @principal", async ({ page }) => {
  const { email } = await register(page);
  expect(await consentOf(email)).toBe(PRIVACY_VERSION);
  await withoutPrivacyConsent(email);

  for (const path of ["/dashboard", "/egresos", "/cuenta", "/reportes"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/autorizacion$/);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Autoriza el uso de tus datos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lee la política de privacidad completa" })).toHaveAttribute("href", "/privacidad");
  expect(await seriousViolations(page)).toEqual([]);

  // Sin marcar la casilla no avanza: el error va debajo, en español.
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  await expect(box(page)).toHaveAccessibleDescription("Para seguir, marca la casilla de la autorización.");
  await expect(page).toHaveURL(/\/autorizacion$/);
  expect(await consentOf(email)).toBeNull();

  await box(page).check();
  await page.getByRole("button", { name: "Aceptar y continuar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await consentOf(email)).toBe(PRIVACY_VERSION);

  // Ya autorizada, /autorizacion lleva al Resumen.
  await page.goto("/autorizacion");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sin autorizar, puede cerrar sesión", async ({ page }) => {
  const { email } = await register(page);
  await withoutPrivacyConsent(email);
  await page.goto("/autorizacion");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("sin autorizar, puede eliminar su cuenta y todos sus datos", async ({ page }) => {
  const { email } = await register(page);
  await withoutPrivacyConsent(email);
  await page.goto("/autorizacion");
  await page.getByText("Eliminar mi cuenta", { exact: true }).click();
  await page.getByLabel("Tu contraseña").fill(PASSWORD);
  await page.getByLabel(/Escribe ELIMINAR para confirmar/).fill("ELIMINAR");
  await page.getByRole("button", { name: "Eliminar mi cuenta para siempre" }).click();
  await expect(page).toHaveURL(/\/cuenta-eliminada$/);
  expect(await consentOf(email)).toBeUndefined();
});

test("en inglés", async ({ page }) => {
  const { email } = await register(page);
  await withoutPrivacyConsent(email);
  await page.context().addCookies([{ name: "idioma", value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/autorizacion$/);
  await expect(page.getByRole("heading", { level: 1, name: "Authorize the use of your data" })).toBeVisible();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page.getByRole("checkbox")).toHaveAccessibleDescription("To continue, check the authorization box.");
});
