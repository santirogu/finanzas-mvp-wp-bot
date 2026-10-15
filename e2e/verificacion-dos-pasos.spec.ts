import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { PASSWORD, adminCommand, logIn, logOut, newPerson, register, test, uniqueEmail, visible } from "./helpers";

// Verificación en dos pasos del admin, de punta a punta en el build de producción. Los códigos se
// calculan como Google Authenticator (test/totp.ts) a partir de la clave que muestra la página.

const heading = (page: Page, name: string | RegExp) => visible(page.getByRole("heading", { name }));
const adminTab = (page: Page) => page.getByRole("navigation").getByRole("link", { name: "Admin", exact: true });

async function seriousViolations(page: Page) {
  // Sin animaciones a medias: un botón que todavía cambia de color daría un contraste falso.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Un código de 6 dígitos que no es el de ahora (ni el de los 30 s vecinos). */
const wrongCode = (secret: string) => String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, "0");

/** Registra una cuenta, le da el rol desde la terminal y la deja en la página de configuración. */
async function newAdmin(page: Page) {
  const email = uniqueEmail();
  await register(page, "Ana Admin", email);
  adminCommand("grant", email);
  await page.reload();
  await adminTab(page).click();
  await expect(page).toHaveURL(/\/admin\/verificacion$/);
  return email;
}

/** Hace los tres pasos de la configuración; devuelve la clave y los códigos de respaldo. */
async function setUpTwoFactor(page: Page, { checkA11y = false } = {}) {
  await expect(heading(page, "Verificación en dos pasos")).toBeVisible();
  if (checkA11y) expect(await seriousViolations(page), "paso 1").toEqual([]);
  await page.getByLabel("Tu contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(heading(page, /Paso 2 de 3/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Código QR/ })).toBeVisible();
  if (checkA11y) expect(await seriousViolations(page), "paso 2").toEqual([]);
  const secret = (await page.getByLabel("Clave de configuración").textContent())!.replace(/\s/g, "");
  await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await page.getByRole("button", { name: "Activar la verificación" }).click();

  await expect(heading(page, /Paso 3 de 3/)).toBeVisible();
  if (checkA11y) expect(await seriousViolations(page), "paso 3").toEqual([]);
  const backupCodes = await page.getByRole("list", { name: "Códigos de respaldo" }).getByRole("listitem").allTextContents();
  expect(backupCodes).toHaveLength(10);
  await page.getByLabel("Ya guardé mis códigos de respaldo").check();
  await page.getByRole("button", { name: "Ir a Administración" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(heading(page, "Administración")).toBeVisible();
  return { secret, backupCodes };
}

test("un admin configura la verificación y desde entonces entra con el código @principal", async ({ page }) => {
  const email = await newAdmin(page);
  const { secret } = await setUpTwoFactor(page, { checkA11y: true });

  // Ya activa, la página de verificación lo dice y no ofrece configurarla otra vez.
  await page.goto("/admin/verificacion");
  await expect(visible(page.getByText("✓ Está activa"))).toBeVisible();
  await expect(page.getByLabel("Tu contraseña")).toHaveCount(0);

  await logOut(page);
  await logIn(page, email);
  await expect(heading(page, "Verificación en dos pasos")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(await seriousViolations(page), "segundo paso del login").toEqual([]);

  // Sin el código no hay sesión: el dashboard manda al login.
  const other = await page.context().newPage();
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login$/);
  await other.close();

  await page.getByLabel("Código de 6 dígitos").fill(wrongCode(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(visible(page.getByRole("alert").filter({ hasText: "Código incorrecto" }))).toBeVisible();

  await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await adminTab(page).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(heading(page, "Administración")).toBeVisible();
});

test("sin el celular se entra con un código de respaldo, que sirve una sola vez", async ({ page }) => {
  const email = await newAdmin(page);
  const { backupCodes } = await setUpTwoFactor(page);

  await logOut(page);
  await logIn(page, email);
  await page.getByRole("button", { name: /usar un código de respaldo/ }).click();
  await page.getByLabel("Código de respaldo").fill(backupCodes[0]);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await logOut(page);
  await logIn(page, email);
  await page.getByRole("button", { name: /usar un código de respaldo/ }).click();
  await page.getByLabel("Código de respaldo").fill(backupCodes[0]);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(visible(page.getByRole("alert").filter({ hasText: "no es válido o ya se usó" }))).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("al activarla se cierran las demás sesiones de la cuenta", async ({ page, browser }) => {
  const email = await newAdmin(page);
  // Otra sesión de la misma cuenta, abierta antes (otro dispositivo, o alguien con la contraseña).
  const otherDevice = await newPerson(browser);
  await logIn(otherDevice, email);
  await expect(otherDevice).toHaveURL(/\/dashboard$/);

  await setUpTwoFactor(page);

  // La sesión vieja ya no sirve: va al login (sin quedarse cargando) y avisa por qué.
  await otherDevice.goto("/dashboard");
  await expect(otherDevice).toHaveURL(/\/login\?sesion=vencida$/);
  await expect(otherDevice.getByRole("status").filter({ hasText: "Tu sesión se cerró" })).toBeVisible();
  // Y puede volver a entrar (ahora con el segundo paso).
  await logIn(otherDevice, email);
  await expect(heading(otherDevice, "Verificación en dos pasos")).toBeVisible();
  // La sesión donde se configuró sigue abierta.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await otherDevice.context().close();
});

test("pnpm admin:reset-2fa cierra la sesión y obliga a configurarla de nuevo", async ({ page }) => {
  const email = await newAdmin(page);
  await setUpTwoFactor(page);

  expect(adminCommand("reset-2fa", email)).toContain("reiniciada. Sesiones cerradas: 1.");

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?sesion=vencida$/);
  await expect(page.getByRole("status").filter({ hasText: "Tu sesión se cerró" })).toBeVisible();
  // Ahora la contraseña sola basta para entrar como usuario…
  await logIn(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  // …pero para administrar hay que volver a configurarla.
  await adminTab(page).click();
  await expect(page).toHaveURL(/\/admin\/verificacion$/);
  await expect(page.getByLabel("Tu contraseña")).toBeVisible();
});

test("un admin sin la verificación no puede ver la página de administración", async ({ page }) => {
  await newAdmin(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/verificacion$/);
  await expect(heading(page, "Administración")).toHaveCount(0);
});

test("un usuario normal no ve la pestaña Admin y las páginas de administración no existen para él", async ({ page }) => {
  await register(page);
  await expect(adminTab(page)).toHaveCount(0);
  for (const path of ["/admin", "/admin/verificacion"]) {
    await page.goto(path);
    await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" })), path).toBeVisible();
    await expect(page.getByLabel("Tu contraseña")).toHaveCount(0);
  }
});

test("sin sesión, las páginas de administración llevan al login", async ({ page }) => {
  for (const path of ["/admin", "/admin/verificacion"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
});

test("desde la API no se puede desactivar, llevarse la clave ni saltarse el código", async ({ page, baseURL }) => {
  const headers = { origin: new URL(baseURL!).origin };

  // Un usuario normal no puede activarla.
  await register(page);
  const asUser = await page.request.post("/api/auth/two-factor/enable", { data: { password: PASSWORD }, headers });
  expect(asUser.status()).toBe(403);

  // Un admin con la verificación activa no puede apagarla ni sacar la clave o códigos nuevos.
  await logOut(page);
  const email = await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  for (const path of ["disable", "get-totp-uri", "generate-backup-codes", "send-otp", "verify-otp"]) {
    const response = await page.request.post(`/api/auth/two-factor/${path}`, {
      data: { password: PASSWORD, code: totp(secret) },
      headers,
    });
    expect(response.status(), path).toBe(404);
  }

  // Y no puede pedir que se recuerde el dispositivo.
  await logOut(page);
  await logIn(page, email);
  await expect(heading(page, "Verificación en dos pasos")).toBeVisible();
  const trusted = await page.request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totp(secret), trustDevice: true },
    headers,
  });
  expect(trusted.status()).toBe(400);
  expect(await trusted.json()).toMatchObject({ code: "TRUST_DEVICE_NOT_ALLOWED" });
});
