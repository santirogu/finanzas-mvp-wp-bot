import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { e2eDatabaseUrl } from "./database-url";

/**
 * IP de prueba distinta para cada navegador. Better Auth limita los intentos de login y registro
 * por IP (3 cada 10 s) y todas las pruebas salen de la misma máquina: sin esto chocarían entre sí.
 * Usa el rango 198.18.0.0/15, reservado para pruebas. En producción no se puede falsificar así:
 * Vercel reemplaza x-forwarded-for con la IP real del cliente.
 */
export const fakeIp = () => `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`;

/** `test` de Playwright con una IP propia por prueba. */
// El segundo parámetro de un fixture suele llamarse `use`; aquí `provide`, para que la regla de
// hooks de React de ESLint no lo confunda con un hook.
export const test = base.extend<{ cspViolations: string[]; nativeValidation: void }>({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-forwarded-for": fakeIp() });
  },
  // En todas las pruebas: si la Content-Security-Policy bloquea algo de la propia app (un script,
  // un estilo, una fuente), el navegador lo registra en la consola y la prueba falla.
  cspViolations: [
    async ({ page }, provide) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
      });
      await provide(violations);
      expect(violations, "violaciones de la Content-Security-Policy").toEqual([]);
    },
    { auto: true },
  ],
  // En todas las pruebas: ningún formulario deja ver el globo de validación del navegador (sale en
  // su idioma, "Please fill out this field."). Los errores van en español debajo de cada campo
  // (useFieldErrors cancela el evento "invalid"); si alguno no lo cancela, la prueba falla.
  nativeValidation: [
    async ({ page }, provide) => {
      await page.addInitScript(() => {
        const counter = window as unknown as { __nativeValidation: string[] };
        counter.__nativeValidation = [];
        document.addEventListener(
          "invalid",
          (event) =>
            setTimeout(() => {
              if (!event.defaultPrevented) counter.__nativeValidation.push((event.target as HTMLInputElement).name);
            }),
          true,
        );
      });
      await provide();
      const shown = await page
        .evaluate(() => (window as unknown as { __nativeValidation?: string[] }).__nativeValidation ?? [])
        .catch(() => []);
      expect(shown, "campos con el globo de validación del navegador").toEqual([]);
    },
    { auto: true },
  ],
});

/** Otro navegador (otra persona), con su propia sesión e IP. */
export async function newPerson(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  return context.newPage();
}

export const PASSWORD = "clave-segura-e2e-123";

/** Correo único por prueba, en un dominio que no se parece a ninguno popular (sin sugerencias). */
export const uniqueEmail = () => `e2e-${randomUUID()}@finanzas-e2e.test`;

/** Crea una cuenta desde el formulario de registro y espera a llegar al dashboard. */
export async function register(page: Page, name = "Ana Pérez", email = uniqueEmail(), { keepTutorial = false } = {}) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Una cuenta nueva ve el tutorial de bienvenida en el Resumen: las pruebas lo omiten, salvo las suyas
  // (e2e/tutorial.spec.ts, con `keepTutorial`).
  if (!keepTutorial) await closeTutorial(page, "Omitir");
  return { name, email };
}

/** La ventana del tutorial de bienvenida (src/components/welcome-tutorial.tsx), en español o en inglés. */
export const tutorial = (page: Page) => page.getByRole("dialog", { name: /^(Te damos la bienvenida|Welcome to)/ });

/**
 * Cierra el tutorial con `button` (Omitir, Empezar…) y espera a que la cuenta lo dé por visto: si la prueba recargara
 * antes, volvería a salir.
 */
export async function closeTutorial(page: Page, button: string) {
  const dialog = page.getByRole("dialog");
  const saved = page.waitForResponse((response) => response.request().method() === "POST" && "next-action" in response.request().headers());
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await saved).ok()).toBe(true);
}

/**
 * Next 16 deja montadas, pero ocultas, las páginas ya visitadas (para volver atrás al instante):
 * un mismo texto puede estar dos veces en el DOM. Las pruebas miran solo lo que se ve.
 */
export const visible = (locator: Locator) => locator.filter({ visible: true });

/** El formulario de la pestaña actual ("Nuevo ingreso" o "Nuevo egreso"). */
const transactionForm = (page: Page) =>
  visible(
    page.locator("form").filter({ has: page.getByRole("heading", { name: /^Nuevo (ingreso|egreso)$/ }) }),
  );

/** Registra un movimiento desde la pestaña actual (Ingresos o Egresos); sin `date` (YYYY-MM-DD), hoy. */
export async function addTransaction(
  page: Page,
  { amount, description, category, date }: { amount: string; description: string; category?: string; date?: string },
) {
  const form = transactionForm(page);
  await form.getByLabel("Monto").fill(amount);
  await form.getByLabel("Descripción").fill(description);
  if (date) await form.getByLabel("Fecha").fill(date);
  if (category) {
    // Las opciones llevan el emoji adelante: se elige por el valor de la que contiene el nombre.
    const select = form.getByLabel("Categoría");
    const value = await select.locator("option", { hasText: category }).getAttribute("value");
    await select.selectOption(value ?? "");
  }
  await form.getByRole("button", { name: /^Registrar (ingreso|egreso)$/ }).click();
}

/** Navega con las pestañas, como lo haría una persona. */
export async function openTab(page: Page, tab: "Resumen" | "Ingresos" | "Egresos" | "Fijos" | "Reportes") {
  const link = page.getByRole("navigation").getByRole("link", { name: tab, exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
  // Espera a que termine de cargar (mientras tanto se ve un esqueleto con aria-busy).
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
  await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
}

/**
 * El aviso emergente con ese texto (src/components/toaster.tsx), el más nuevo si hay varios iguales.
 * Un aviso de éxito lleva solo su mensaje: con una expresión anclada (/^Egreso registrado$/) se pide
 * ese exacto.
 */
/** Pone un presupuesto desde Configuración (la categoría por su nombre) y espera el aviso. */
export async function addBudget(page: Page, category: string, amount: string) {
  await page.goto("/configuracion");
  await visible(page.getByRole("button", { name: "Agregar un presupuesto" })).click();
  const dialog = page.getByRole("dialog");
  const select = dialog.getByLabel("Categoría");
  const value = await select.locator("option", { hasText: category }).getAttribute("value");
  await select.selectOption(value ?? "");
  await dialog.getByLabel("Monto por mes").fill(amount);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(toast(page, `Se guardó el presupuesto de ${category}`)).toBeVisible();
}

export const toast = (page: Page, text: string | RegExp) => toasts(page).filter({ hasText: text }).last();

/** Todos los avisos emergentes que se ven. */
export const toasts = (page: Page) => page.getByRole("region", { name: "Avisos" }).getByRole("listitem");

/**
 * Cierra con su X los avisos emergentes que se vean: están fijos abajo y pueden tapar un botón (con el
 * mouse encima, además, se pausan). Es lo que haría una persona para tocar lo que queda debajo.
 */
export async function closeToasts(page: Page) {
  const close = toasts(page).getByRole("button", { name: "Cerrar el aviso" });
  while ((await close.count()) > 0) await close.first().click();
}

/** Mensaje de error del formulario (Next también tiene un role="alert" vacío para anunciar rutas). */
export const formAlert = (page: Page) => page.locator("form").getByRole("alert");

/**
 * Corre un comando de terminal de administración (pnpm admin:grant, admin:revoke, admin:reset-2fa)
 * contra la base de las E2E y confirma escribiendo el correo, como lo hace el dueño en producción.
 */
export function adminCommand(command: "grant" | "revoke" | "super" | "reset-2fa", email: string) {
  return execFileSync("pnpm", ["-s", `admin:${command}`, email], {
    input: `${email}\n`,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
  });
}

/** Inicia sesión desde el formulario (primer paso: correo y contraseña). */
export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Abre el menú de la cuenta del encabezado (el círculo con las iniciales) y devuelve su tarjeta. */
export async function openAccountMenu(page: Page) {
  await visible(page.getByRole("button", { name: /^Tu cuenta: / })).click();
  const card = visible(page.getByRole("group", { name: "Tu cuenta" }));
  await expect(card).toBeVisible();
  return card;
}

/** Va a Mi cuenta desde el menú de la cuenta, como lo haría una persona. */
export async function goToAccount(page: Page) {
  await (await openAccountMenu(page)).getByRole("link", { name: "Mi cuenta" }).click();
  await expect(visible(page.getByRole("heading", { name: "Mi cuenta", exact: true }))).toBeVisible();
}

/** Va a la tarjeta de WhatsApp de Mi cuenta (ahí se conecta y se desvincula), como lo haría una persona. */
export async function goToWhatsApp(page: Page) {
  await goToAccount(page);
  await expect(visible(page.getByRole("region", { name: "WhatsApp" }))).toBeVisible();
}

/** Cierra sesión con Salir, en el menú de la cuenta. */
export async function logOut(page: Page) {
  await (await openAccountMenu(page)).getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
