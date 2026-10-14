import { randomInt, randomUUID } from "node:crypto";
import { test as base, expect, type Browser, type Locator, type Page } from "@playwright/test";

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
export const test = base.extend<{ cspViolations: string[] }>({
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
export async function register(page: Page, name = "Ana Pérez", email = uniqueEmail()) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { name, email };
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

/** Registra un movimiento desde la pestaña actual (Ingresos o Egresos). */
export async function addTransaction(
  page: Page,
  { amount, description, category }: { amount: string; description: string; category?: string },
) {
  const form = transactionForm(page);
  await form.getByLabel("Monto").fill(amount);
  await form.getByLabel("Descripción").fill(description);
  if (category) {
    // Las opciones llevan el emoji adelante: se elige por el valor de la que contiene el nombre.
    const select = form.getByLabel("Categoría");
    const value = await select.locator("option", { hasText: category }).getAttribute("value");
    await select.selectOption(value ?? "");
  }
  await form.getByRole("button", { name: /^Registrar (ingreso|egreso)$/ }).click();
}

/** Navega con las pestañas, como lo haría una persona. */
export async function openTab(page: Page, tab: "Resumen" | "Ingresos" | "Egresos") {
  const link = page.getByRole("navigation").getByRole("link", { name: tab, exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
  // Espera a que termine de cargar (mientras tanto se ve un esqueleto con aria-busy).
  await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
  await expect(visible(page.getByRole("heading", { level: 1 }))).toBeVisible();
}

/** Mensaje de error del formulario (Next también tiene un role="alert" vacío para anunciar rutas). */
export const formAlert = (page: Page) => page.locator("form").getByRole("alert");
