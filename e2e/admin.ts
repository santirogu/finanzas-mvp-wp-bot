import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { PASSWORD, adminCommand, logIn, register, uniqueEmail, visible } from "./helpers";

// Un admin de punta a punta: cuenta registrada, rol dado con el comando real de terminal y la
// verificación en dos pasos configurada desde la página (códigos como Google Authenticator).

export const heading = (page: Page, name: string | RegExp) => visible(page.getByRole("heading", { name }));
export const adminTab = (page: Page) => page.getByRole("navigation").getByRole("link", { name: "Admin", exact: true });

export async function seriousViolations(page: Page) {
  // Sin animaciones a medias: un botón que todavía cambia de color daría un contraste falso. Dos
  // cuadros antes: una transición que recién empieza todavía no aparece en getAnimations().
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // La barrita del tiempo de los avisos emergentes (toast-timer) no cambia colores: no se espera.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || (a as CSSAnimation).animationName === "toast-timer"),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Un código de 6 dígitos que no es el de ahora (ni el de los 30 s vecinos). */
export const wrongCode = (secret: string) => String((Number(totp(secret)) + 500_000) % 1_000_000).padStart(6, "0");

/**
 * Registra una cuenta, le da el rol desde la terminal y la deja en la página de configuración. Dar el
 * rol cierra sus sesiones: vuelve a entrar y, como todavía no tiene la verificación en dos pasos, va
 * directo a configurarla.
 */
export async function newAdmin(page: Page) {
  const email = uniqueEmail();
  await register(page, "Ana Admin", email);
  adminCommand("grant", email);
  await page.context().clearCookies();
  await logIn(page, email);
  await expect(page).toHaveURL(/\/admin\/seguridad$/);
  return email;
}

/** Hace los tres pasos de la configuración; devuelve la clave y los códigos de respaldo. */
export async function setUpTwoFactor(page: Page, { checkA11y = false } = {}) {
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
