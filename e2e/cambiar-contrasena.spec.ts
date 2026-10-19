import { expect, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { goToAccount, logIn, logOut, newPerson, openTab, PASSWORD, register, test, toast, uniqueEmail, visible } from "./helpers";

// "Cambiar contraseña" en Mi cuenta, de punta a punta: con la contraseña nueva se entra y con la vieja
// no, la sesión de este dispositivo sigue y las demás se cierran. Un admin confirma con su código.
const NEW_PASSWORD = "otra-clave-segura-e2e-456";
const security = (page: Page) => visible(page.getByRole("region", { name: "Seguridad" }));

async function fillPasswords(page: Page, current: string, next: string, repeat = next) {
  await security(page).getByLabel("Contraseña actual").fill(current);
  await security(page).getByLabel("Contraseña nueva", { exact: true }).fill(next);
  await security(page).getByLabel("Repite la contraseña nueva").fill(repeat);
}

test("cambiar la contraseña: esta sesión sigue, las demás se cierran y la vieja ya no sirve @principal", async ({ page, browser }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  // Otra sesión de la misma cuenta, abierta antes.
  const other = await newPerson(browser);
  await logIn(other, email);
  await expect(other).toHaveURL(/\/dashboard$/);

  await test.step("Mi cuenta: el correo y la moneda dicen Pronto", async () => {
    await goToAccount(page);
    const data = visible(page.getByRole("region", { name: "Tus datos" }));
    await expect(data.getByRole("button", { name: "Cambiar correo" })).toBeDisabled();
    await expect(data).toContainText("Peso colombiano (COP)");
    await expect(data).toContainText("Pronto: USD y EUR");
  });

  await test.step("los errores van debajo de cada campo, en español", async () => {
    await security(page).getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(security(page).getByLabel("Contraseña actual")).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await fillPasswords(page, PASSWORD, "corta");
    await security(page).getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(visible(security(page).getByText("Debe tener al menos 8 caracteres."))).toHaveCount(2);
    await fillPasswords(page, "no-es-la-clave", NEW_PASSWORD);
    await security(page).getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(visible(security(page).getByText("Contraseña incorrecta."))).toBeVisible();
  });

  await test.step("con la actual correcta se cambia, y aquí la sesión sigue", async () => {
    await fillPasswords(page, PASSWORD, NEW_PASSWORD);
    await security(page).getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(toast(page, "Se cambió tu contraseña. Cerramos tus otras sesiones.")).toHaveAttribute("data-tone", "success");
    await expect(security(page).getByRole("button", { name: "Cambiar contraseña" })).toBeVisible();
    await openTab(page, "Resumen");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  await test.step("la otra sesión se cerró", async () => {
    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    await other.context().close();
  });

  await test.step("con la vieja ya no entra; con la nueva, sí", async () => {
    await logOut(page);
    await logIn(page, email, PASSWORD);
    await expect(visible(page.getByRole("alert"))).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard$/);
    await logIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test("un admin confirma el cambio con su código de Google Authenticator", async ({ page }) => {
  const email = await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await goToAccount(page);
  await security(page).getByRole("button", { name: "Cambiar contraseña" }).click();
  await fillPasswords(page, PASSWORD, NEW_PASSWORD);
  const code = security(page).getByLabel("Código de Google Authenticator");
  await expect(code).toBeVisible();
  await code.fill(totp(secret, Date.now() + 30_000));
  await security(page).getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(toast(page, "Se cambió tu contraseña. Cerramos tus otras sesiones.")).toBeVisible();
  // Con la nueva, el login sigue pidiendo el código.
  await logOut(page);
  await logIn(page, email, NEW_PASSWORD);
  await expect(visible(page.getByLabel("Código de 6 dígitos"))).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Mi cuenta con el formulario abierto, sin problemas de accesibilidad en modo ${colorScheme === "light" ? "claro" : "oscuro"}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await register(page);
    await goToAccount(page);
    await security(page).getByRole("button", { name: "Cambiar contraseña" }).click();
    expect(await seriousViolations(page)).toEqual([]);
  });
}
