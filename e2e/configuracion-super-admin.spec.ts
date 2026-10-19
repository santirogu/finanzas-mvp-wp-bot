import { expect, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { adminTab, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { adminCommand, logIn, newPerson, register, test, toast, uniqueEmail, visible } from "./helpers";

// El super admin, de punta a punta: hace admin a una cuenta y se lo quita, cada vez con su código de
// Google Authenticator, y la otra persona lo nota en su navegador. Hay uno solo en toda la app (la base
// no admite dos), así que va en el proyecto "configuracion", que corre aparte de las demás.

const danger = (page: Page) => visible(page.getByRole("region", { name: "Zona de peligro" }));
const dialog = (page: Page) => page.getByRole("dialog");
const accountButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Tu cuenta: / });
/** El código de ahora o, para la segunda acción seguida, el del período siguiente (un código sirve una vez). */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

async function openAccount(page: Page, email: string) {
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(email)}`);
  await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
}

async function confirmWith(page: Page, code: string, button: string) {
  await dialog(page).getByLabel("Código de Google Authenticator").fill(code);
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
}

test("el super admin hace admin a una cuenta y se lo quita; un admin común no puede", async ({ page, browser }) => {
  let secret = "";
  let superEmail = "";
  await test.step("el super admin: admin con la verificación lista y la marca desde la terminal", async () => {
    superEmail = await newAdmin(page);
    ({ secret } = await setUpTwoFactor(page));
    expect(adminCommand("super", superEmail)).toContain("ahora es el super admin");
    await page.reload();
    await expect(accountButton(page)).toHaveAccessibleName("Tu cuenta: Ana Admin, super admin");
    await expect(page.getByRole("banner").locator("[data-admin-shield]")).toHaveClass(/text-superadmin/);
    // En su propia ficha no hay nada que hacer.
    await openAccount(page, superEmail);
    await expect(visible(page.getByText("Superadministrador"))).toBeVisible();
    await expect(page.getByRole("region", { name: "Zona de peligro" })).toHaveCount(0);
  });

  // Beto: una cuenta normal, con su sesión abierta en su navegador.
  const beto = await newPerson(browser);
  const betoEmail = uniqueEmail();
  await register(beto, "Beto Ruiz", betoEmail);

  await test.step("le da el rol a Beto, con su código", async () => {
    await openAccount(page, betoEmail);
    await danger(page).getByRole("button", { name: "Hacer admin" }).click();
    await expect(dialog(page)).toHaveAccessibleName("¿Hacer admin a Beto Ruiz?");
    expect(await seriousViolations(page)).toEqual([]);
    await confirmWith(page, codeFor(secret), "Hacer admin");
    await expect(toast(page, "Beto Ruiz ahora es admin.")).toHaveAttribute("data-tone", "success");
    // Ahora, en su ficha, lo único que hay es quitarle el rol.
    await expect(danger(page).getByRole("button", { name: "Quitar admin" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Acciones", exact: true })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("a Beto se le cerró la sesión; al volver a entrar va directo a configurar la verificación", async () => {
    await beto.reload();
    await expect(beto).toHaveURL(/\/login/);
    await logIn(beto, betoEmail);
    await expect(beto).toHaveURL(/\/admin\/seguridad$/);
    await expect(accountButton(beto)).toHaveAccessibleName("Tu cuenta: Beto Ruiz, admin");
  });

  await test.step("Beto, ya admin, no puede dar ni quitar el rol", async () => {
    await setUpTwoFactor(beto);
    const carla = await newPerson(browser);
    const carlaEmail = uniqueEmail();
    await register(carla, "Carla Gómez", carlaEmail);
    // En la ficha de una cuenta normal tiene las acciones de siempre, sin "Hacer admin"...
    await openAccount(beto, carlaEmail);
    await expect(danger(beto).getByRole("button", { name: "Eliminar cuenta" })).toBeVisible();
    await expect(beto.getByRole("button", { name: "Hacer admin" })).toHaveCount(0);
    // ...y en la del super admin, nada.
    await openAccount(beto, superEmail);
    await expect(visible(beto.getByText("Superadministrador"))).toBeVisible();
    await expect(beto.getByRole("region", { name: "Zona de peligro" })).toHaveCount(0);
    await carla.context().close();
  });

  await test.step("el super admin se lo quita: queda en el historial de la cuenta", async () => {
    await openAccount(page, betoEmail);
    await danger(page).getByRole("button", { name: "Quitar admin" }).click();
    await expect(dialog(page)).toHaveAccessibleName("¿Quitarle el rol de admin a Beto Ruiz?");
    await confirmWith(page, codeFor(secret, 1), "Quitar admin");
    await expect(toast(page, "Beto Ruiz ya no es admin.")).toHaveAttribute("data-tone", "removal");
    await expect(danger(page).getByRole("button", { name: "Hacer admin" })).toBeVisible();
    const history = visible(page.getByRole("list", { name: "Acciones del admin" }));
    await expect(history.getByRole("listitem").filter({ hasText: "le dio el rol de admin a Beto Ruiz" })).toHaveCount(1);
    await expect(history.getByRole("listitem").filter({ hasText: "le quitó el rol de admin a Beto Ruiz" })).toHaveCount(1);
  });

  await test.step("Beto vuelve a entrar solo con su contraseña (sin código) y ya no ve Admin", async () => {
    await beto.reload();
    await expect(beto).toHaveURL(/\/login/);
    await logIn(beto, betoEmail);
    await expect(beto).toHaveURL(/\/dashboard$/);
    await expect(visible(beto.getByText("Hola, Beto"))).toBeVisible();
    await expect(adminTab(beto)).toHaveCount(0);
  });
  await beto.context().close();
});
