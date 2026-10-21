import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { heading, newAdmin, seriousViolations, setUpTwoFactor } from "./admin";
import { E2E_CRON_SECRET, FAKE_SERVICES_URL } from "./fake-config";
import { test, visible } from "./helpers";

// Salud del sistema en la administración (/admin/salud): el estado de la app, la versión, la base, la
// limpieza diaria, las conexiones del bot y los despliegues recientes (las releases del GitHub falso).

const region = (page: Page, name: string) => visible(page.getByRole("region", { name }));
const check = (page: Page, label: string) => region(page, "Salud del sistema").getByRole("listitem").filter({ hasText: `${label}:` });

/** Corre la limpieza diaria como Vercel Cron: así hay una corrida reciente y la página está "en orden". */
async function runCleanup(request: APIRequestContext) {
  const response = await request.get("/api/cron/limpieza", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);
}

test("el estado de la app, la versión, la base, la limpieza y los despliegues @principal", async ({ page, request }) => {
  await runCleanup(request);
  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.goto("/admin/salud");
  await expect(page).toHaveTitle("Salud del sistema · Administración · Finanzas");

  await test.step("el estado: todo en orden y cada revisión", async () => {
    await expect(region(page, "Salud del sistema")).toContainText("Todo en orden");
    await expect(check(page, "Healthcheck (/api/health)")).toContainText("OK");
    await expect(check(page, "Variables de entorno")).toContainText("Las 8 obligatorias están configuradas");
    await expect(check(page, "Migraciones")).toContainText(/Al día: (\d+) de \1/);
    await expect(check(page, "Base de datos")).toContainText(/Responde en \d+ ms/);
    await expect(check(page, "Limpieza diaria")).toContainText("La última corrida:");
    // Los nombres de las variables, nunca sus valores (los de las E2E son de mentira, pero igual).
    await expect(page.locator("main")).not.toContainText("e2e-token-falso");
    await expect(page.locator("main")).not.toContainText(E2E_CRON_SECRET);
  });

  await test.step("la versión, la base con sus tablas y la limpieza con sus corridas", async () => {
    await expect(region(page, "Versión")).toContainText("Producción");
    await expect(region(page, "Base de datos")).toContainText(/Postgres \d+.* · ocupa [\d.,]+ (kB|MB|GB)/);
    const tables = region(page, "Base de datos").getByRole("table", { name: "Tablas de la base, de la más grande a la más chica" });
    for (const name of ["transaction", "whatsapp_message", "cron_run"]) await expect(tables.getByRole("rowheader", { name, exact: true })).toBeVisible();
    await expect(region(page, "Limpieza diaria")).toContainText("Todos los días a las 4:00 a. m. (hora de Colombia)");
    await expect(region(page, "Limpieza diaria").getByRole("listitem").first()).toContainText(/Borró|No había nada para borrar/);
  });

  await test.step("los despliegues: las releases de GitHub con sus cambios", async () => {
    const deployments = region(page, "Despliegues recientes");
    const releases = deployments.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^v9\./ }) });
    await expect(releases).toHaveCount(2);
    await expect(releases.first()).toContainText("web: salud del sistema (#901)");
    await expect(releases.first()).toContainText("y 2 cambios más");
    await expect(releases.first().getByRole("link", { name: "v9.2.0" })).toHaveAttribute("href", "https://github.com/santirogu/finanzas-mvp-wp-bot/releases/tag/v9.2.0");
    // La versión de las E2E no es ninguna de las del GitHub falso: ninguna lleva la marca.
    await expect(deployments.getByText("Esta versión", { exact: true })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test("probar las conexiones: WhatsApp y Claude sin gastar nada, y un token vencido se explica", async ({ page, request }) => {
  // El fallo simulado es de todo el servidor falso: si un intento anterior se cayó antes de usarlo, se limpia.
  await request.post(`${FAKE_SERVICES_URL}/restablecer`);
  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.goto("/admin/salud");
  const connections = region(page, "Conexiones");
  const result = (name: string) => connections.getByRole("listitem").filter({ hasText: `${name}:` });

  await test.step("con los servidores falsos, los dos conectan", async () => {
    await connections.getByRole("button", { name: "Probar conexiones" }).click();
    await expect(result("WhatsApp")).toContainText("Conectado");
    await expect(result("WhatsApp")).toContainText("Finanzas MVP (prueba) · +57 300 0000000");
    await expect(result("Claude")).toContainText("Claude falso (claude-haiku-5-5)");
    await expect(connections.getByRole("status")).toContainText(/(Último mensaje que llegó al webhook: |Todavía no ha llegado ningún mensaje).* Probado a las /);
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("con el token vencido, dice por qué y qué respondió Meta (sin el token)", async () => {
    await request.post(`${FAKE_SERVICES_URL}/fallar?servicio=whatsapp`);
    await connections.getByRole("button", { name: "Probar otra vez" }).click();
    await expect(result("WhatsApp")).toContainText("El token de WhatsApp no sirve: vencido, revocado o mal copiado");
    await expect(result("WhatsApp")).toContainText("HTTP 401 · (#190) Error validating access token: Session has expired.");
    await expect(result("Claude")).toContainText("Conectado");
    await expect(connections).not.toContainText("e2e-token-falso");
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test("Bot ya no prueba las conexiones: manda a Salud del sistema", async ({ page }) => {
  await newAdmin(page);
  await setUpTwoFactor(page);
  await page.goto("/admin/bot");
  await expect(heading(page, "Bot de WhatsApp")).toBeVisible();
  await expect(page.getByRole("region", { name: "Conexiones" })).toHaveCount(0);
  await visible(page.getByText("Las conexiones con WhatsApp y Claude se prueban en")).getByRole("link", { name: "Salud del sistema" }).click();
  await expect(page).toHaveURL(/\/admin\/salud$/);
  await expect(region(page, "Conexiones")).toBeVisible();
});
