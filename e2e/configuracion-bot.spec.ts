import { expect, type Browser, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor, wrongCode } from "./admin";
import { fakeIp, register, test, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// La configuración del bot en /admin/bot, de punta a punta: pausar y reanudar Claude, y cambiar los
// topes por cuenta. Cambia la configuración de toda la app, así que corre en el proyecto
// "configuracion" (playwright.config.ts), nunca a la vez que las demás pruebas, y sus pruebas van
// una después de otra.
test.describe.configure({ mode: "serial" });

const settings = (page: Page) => visible(page.getByRole("region", { name: "Configuración" }));
const dialog = (page: Page) => page.getByRole("dialog");
const codeField = (page: Page) => dialog(page).getByLabel("Código de Google Authenticator");
/** El código de ahora o, para la segunda acción seguida, el del período siguiente (un código sirve una vez). */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

/** Beto, en su navegador, con su WhatsApp vinculado; devuelve su número y cuántas respuestas lleva. */
async function betoWithWhatsApp(browser: Browser, request: Parameters<typeof sendWhatsApp>[0]) {
  const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } })).newPage();
  const phone = newPhone();
  await register(page, "Beto Bot");
  await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, phone, `VINCULAR ${code}`);
  await nthReply(request, phone, 1);
  await page.context().close();
  let replies = 1;
  /** Beto escribe y devuelve lo que le respondió el bot. */
  return async (text: string) => {
    await sendWhatsApp(request, phone, text);
    return nthReply(request, phone, ++replies);
  };
}

async function adminOnBot(page: Page) {
  await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto("/admin/bot");
  await expect(heading(page, "Bot de WhatsApp")).toBeVisible();
  return secret;
}

async function confirmWith(page: Page, code: string, button: string) {
  await codeField(page).fill(code);
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
}

test("el admin pausa Claude: el bot pide usar la web, los comandos siguen y queda en el historial", async ({
  page,
  browser,
  request,
}) => {
  const beto = await betoWithWhatsApp(browser, request);
  const secret = await adminOnBot(page);
  await expect(settings(page)).toContainText("Activo: entiende los mensajes escritos libremente.");
  await expect(settings(page)).toContainText("Sin cambios: valen los de siempre.");

  await test.step("pausar pide el código; con uno equivocado no cambia nada", async () => {
    await settings(page).getByRole("button", { name: "Pausar Claude" }).click();
    await expect(dialog(page)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await confirmWith(page, wrongCode(secret), "Pausar");
    await expect(codeField(page)).toHaveAttribute("aria-invalid", "true");
    await confirmWith(page, codeFor(secret), "Pausar");
    await expect(dialog(page)).toBeHidden();
    await expect(settings(page).getByRole("status")).toContainText("Claude quedó en pausa");
    await expect(settings(page)).toContainText("En pausa: el bot solo responde balance, deshacer y ayuda.");
    await expect(settings(page)).toContainText(/Último cambio: Ana Admin · /);
    // El aviso recibe el foco: la ventana ya se cerró.
    await expect(settings(page).getByRole("status")).toBeFocused();
  });

  await test.step("en pausa, a lo escrito libremente responde que use la web; balance sigue", async () => {
    const reply = await beto("almuerzo 25.900,50");
    expect(reply).toContain("no puedo entender mensajes escritos libremente");
    expect(reply).toContain("http://localhost:3100/dashboard");
    expect(await beto("balance")).toContain("Aún no tienes movimientos");
  });

  await test.step("Inicio lo avisa y el historial lo registra como acción del admin", async () => {
    await page.goto("/admin");
    const card = visible(page.getByRole("list", { name: "Módulos de administración" })).getByRole("listitem").filter({ hasText: "Bot de WhatsApp" });
    await expect(card).toContainText(/Claude en pausa · \d+ mensajes? hoy/);
    await page.goto("/admin/historial?tipo=admin");
    const event = visible(page.getByRole("listitem").filter({ hasText: "pausó Claude en el bot" })).first();
    await expect(event).toContainText("Ana Admin pausó Claude en el bot");
    await expect(event).toContainText("Bot de WhatsApp");
  });

  await test.step("al reanudarlo, el bot vuelve a entender los mensajes", async () => {
    await page.goto("/admin/bot");
    await settings(page).getByRole("button", { name: "Reanudar Claude" }).click();
    await confirmWith(page, codeFor(secret, 1), "Reanudar");
    await expect(settings(page).getByRole("status")).toContainText("Claude volvió a funcionar");
    await expect(settings(page)).toContainText("Activo: entiende los mensajes escritos libremente.");
    expect(await beto("almuerzo 25.900,50")).toMatch(/✅ Egreso registrado: \*Almuerzo\*/);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test("cambiar los topes: fuera de rango avisa en su campo; con 1 por hora, el segundo mensaje espera", async ({
  page,
  browser,
  request,
}) => {
  const beto = await betoWithWhatsApp(browser, request);
  const secret = await adminOnBot(page);
  const code = codeFor(secret);

  await test.step("un tope fuera de rango se marca en su campo, sin gastar el código", async () => {
    await settings(page).getByRole("button", { name: "Cambiar" }).click();
    await expect(dialog(page).getByLabel("Por hora")).toHaveValue("20");
    await dialog(page).getByLabel("Por día").fill("3000");
    await confirmWith(page, code, "Guardar topes");
    await expect(dialog(page).getByLabel("Por día")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog(page)).toContainText("El tope por día va de 1 a 2.000.");
    await expect(dialog(page).getByLabel("Por día")).toHaveValue("3000");
    expect(await seriousViolations(page)).toEqual([]);
  });

  await test.step("con el mismo código, deja 1 por hora", async () => {
    await dialog(page).getByLabel("Por hora").fill("1");
    await dialog(page).getByLabel("Por día").fill("100");
    await confirmWith(page, code, "Guardar topes");
    await expect(settings(page).getByRole("status")).toContainText("Los topes quedaron en 1 por hora y 100 por día, por cuenta.");
    await expect(settings(page)).toContainText("1 por hora y 100 por día, de mensajes con Claude.");
    await expect(visible(page.getByRole("heading", { name: /Cuentas que llegaron al tope/ }))).toContainText("(1 por hora o 100 por día)");
  });

  await test.step("el primer mensaje se registra; el segundo, en la misma hora, espera", async () => {
    expect(await beto("almuerzo 25.900,50")).toMatch(/✅ Egreso registrado/);
    expect(await beto("almuerzo 25.900,50")).toContain("Recibí muchos mensajes en poco tiempo");
    expect(await beto("balance")).toMatch(/Egresos: \$25\.900,50/);
  });

  await test.step("el historial guarda los topes nuevos y los de antes", async () => {
    await page.goto("/admin/historial?tipo=admin");
    await expect(visible(page.getByRole("listitem").filter({ hasText: "cambió los topes de Claude por cuenta" })).first()).toContainText(
      "ahora 1 por hora y 100 por día (antes 20 por hora y 100 por día)",
    );
  });

  // Los de siempre otra vez, por si alguien corre más pruebas sobre esta misma base.
  await page.goto("/admin/bot");
  await settings(page).getByRole("button", { name: "Cambiar" }).click();
  await dialog(page).getByLabel("Por hora").fill("20");
  await confirmWith(page, codeFor(secret, 1), "Guardar topes");
  await expect(settings(page)).toContainText("20 por hora y 100 por día");
});
