import { expect, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { totp } from "../test/totp";
import { heading, newAdmin, seriousViolations, setUpTwoFactor, wrongCode } from "./admin";
import { e2eDatabaseUrl } from "./database-url";
import { fakeIp, goToWhatsApp, logIn, logOut, register, test, toast, toasts, uniqueEmail, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// Las acciones del admin sobre una cuenta (/admin/usuarios/[id]), de punta a punta: cada una pide el
// código de Google Authenticator (un código por acción), cambia de verdad lo que dice y queda en el
// historial. Las personas usan su propio navegador, para ver el efecto del otro lado.

const actionsRegion = (page: Page) => visible(page.getByRole("region", { name: "Acciones" }));
const dangerRegion = (page: Page) => visible(page.getByRole("region", { name: "Zona de peligro" }));
const dialog = (page: Page) => page.getByRole("dialog");
const codeField = (page: Page) => dialog(page).getByLabel("Código de Google Authenticator");
/** El aviso emergente de la última acción. */
const status = (page: Page) => toasts(page).last();
const adminActions = (page: Page) => visible(page.getByRole("list", { name: "Acciones del admin" })).getByRole("listitem");

/** El código de ahora o, para la segunda acción seguida, el del período siguiente (un código sirve una vez). */
const codeFor = (secret: string, nth: 0 | 1 = 0) => totp(secret, Date.now() + nth * 30_000);

/** Otra persona, en su navegador, registrada y con su WhatsApp vinculado. */
async function personWithWhatsApp(browser: Browser, name: string, request: Parameters<typeof sendWhatsApp>[0]) {
  const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } })).newPage();
  const email = uniqueEmail();
  const phone = newPhone();
  await register(page, name, email);
  await goToWhatsApp(page);
  await page.getByRole("button", { name: "Conectar WhatsApp" }).click();
  const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!.replace("VINCULAR ", "");
  await sendWhatsApp(request, phone, `VINCULAR ${code}`);
  await nthReply(request, phone, 1);
  return { page, email, phone };
}

async function lockLogin(email: string) {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  await sql`
    insert into login_failure (email, failures, first_failure_at, locked_until)
    values (${email}, 5, now(), now() + interval '15 minutes')`;
  await sql.end();
}

/** Un admin listo, en el detalle de la cuenta con ese correo. */
async function adminOnAccount(page: Page, email: string) {
  const adminEmail = await newAdmin(page);
  const { secret } = await setUpTwoFactor(page);
  await page.goto(`/admin/usuarios?q=${encodeURIComponent(email)}`);
  await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/usuarios\/[\w-]+$/);
  return { secret, adminEmail };
}

async function confirmWith(page: Page, code: string, button: string) {
  await codeField(page).fill(code);
  await dialog(page).getByRole("button", { name: button, exact: true }).click();
}

test("el admin desbloquea el inicio de sesión y cierra las sesiones de una cuenta, cada vez con un código @principal", async ({
  page,
  browser,
  request,
}) => {
  const beto = await personWithWhatsApp(browser, "Beto Acciones", request);
  await lockLogin(beto.email);
  await test.step("Beto, bloqueado, no puede entrar ni con su contraseña", async () => {
    await logOut(beto.page);
    await logIn(beto.page, beto.email);
    await expect(visible(beto.page.getByRole("alert").filter({ hasText: "quedó bloqueada" }))).toBeVisible();
    await expect(beto.page).not.toHaveURL(/\/dashboard$/);
  });

  const { secret } = await adminOnAccount(page, beto.email);
  await expect(heading(page, /Beto Acciones/)).toBeVisible();
  await expect(visible(page.getByText("Todavía no hay acciones del admin sobre esta cuenta."))).toBeVisible();

  await test.step("un código equivocado se marca y dice cuántos intentos quedan", async () => {
    await actionsRegion(page).getByRole("button", { name: "Desbloquear" }).click();
    await expect(dialog(page)).toHaveAccessibleName("¿Desbloquear el inicio de sesión de Beto Acciones?");
    expect(await seriousViolations(page), "ventana de confirmación").toEqual([]);
    await confirmWith(page, wrongCode(secret), "Desbloquear");
    await expect(dialog(page).getByText("El código no es correcto. Te quedan 4 intentos.")).toBeVisible();
    await expect(codeField(page)).toHaveAttribute("aria-invalid", "true");
  });

  const firstCode = codeFor(secret);
  await test.step("con el código correcto se desbloquea, y la acción desaparece", async () => {
    await confirmWith(page, firstCode, "Desbloquear");
    await expect(status(page)).toHaveText("Se desbloqueó el inicio de sesión de Beto Acciones.");
    await expect(dialog(page)).toHaveCount(0);
    await expect(actionsRegion(page).getByRole("button", { name: "Desbloquear" })).toHaveCount(0);
    await expect(visible(page.getByText(/Bloqueada hasta las? \d/))).toHaveCount(0);
  });

  await test.step("Beto ya puede entrar", async () => {
    await logIn(beto.page, beto.email);
    await expect(beto.page).toHaveURL(/\/dashboard$/);
  });

  await test.step("el mismo código no sirve para otra acción; el siguiente sí", async () => {
    // Con la sesión nueva de Beto, aparece "Cerrar sesiones".
    await page.reload();
    await actionsRegion(page).getByRole("button", { name: "Cerrar sesiones" }).click();
    await confirmWith(page, firstCode, "Cerrar sesiones");
    await expect(dialog(page).getByText("Ese código ya se usó. Espera el siguiente en Google Authenticator.")).toBeVisible();
    await confirmWith(page, codeFor(secret, 1), "Cerrar sesiones");
    await expect(status(page)).toHaveText("Se cerró la sesión de Beto Acciones.");
    await expect(visible(page.getByText("No tiene sesiones abiertas."))).toBeVisible();
  });

  await test.step("Beto queda sin sesión, pero su WhatsApp sigue vinculado", async () => {
    await beto.page.reload();
    await expect(beto.page).toHaveURL(/\/login/);
    await expect(actionsRegion(page).getByRole("button", { name: "Desvincular" })).toBeVisible();
  });

  await test.step("las dos acciones quedan en su detalle y en el Historial, con el nombre del admin", async () => {
    await expect(adminActions(page)).toHaveCount(2);
    await expect(adminActions(page).nth(0)).toContainText("Ana Admin cerró las sesiones de Beto Acciones");
    await expect(adminActions(page).nth(0)).toContainText("1 sesión");
    await expect(adminActions(page).nth(1)).toContainText("Ana Admin desbloqueó el inicio de sesión de Beto Acciones");

    await page.goto(`/admin/historial?tipo=admin&q=${encodeURIComponent(beto.email)}`);
    const events = visible(page.locator("main ol > li"));
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText("Ana Admin cerró las sesiones de Beto Acciones");
    await expect(visible(page.getByRole("link", { name: "Quitar filtro: Acciones del admin" }))).toBeVisible();
  });

  await beto.page.context().close();
});

test("el admin desvincula el WhatsApp y elimina una cuenta; de ella solo queda 'eliminó una cuenta'", async ({
  page,
  browser,
  request,
}) => {
  const carla = await personWithWhatsApp(browser, "Carla Acciones", request);
  const { secret } = await adminOnAccount(page, carla.email);

  await test.step("desvincular su WhatsApp", async () => {
    await actionsRegion(page).getByRole("button", { name: "Desvincular" }).click();
    await expect(dialog(page)).toHaveAccessibleDescription(/El bot dejará de registrar lo que escriba desde \+57/);
    await confirmWith(page, codeFor(secret), "Desvincular");
    await expect(status(page)).toHaveText("Se desvinculó el WhatsApp de Carla Acciones.");
    await expect(adminActions(page).first()).toContainText("Ana Admin desvinculó el WhatsApp");
    // Carla lo ve en Mi cuenta: puede vincularlo otra vez.
    await carla.page.goto("/cuenta");
    await expect(visible(carla.page.getByRole("button", { name: "Conectar WhatsApp" }))).toBeVisible();
    // Y el bot ya no registra lo que escriba desde ese número.
    await sendWhatsApp(request, carla.phone, "gasté 20 mil en almuerzo");
    expect(await nthReply(request, carla.phone, 2)).toContain("Este número aún no está vinculado a una cuenta");
  });

  await test.step("eliminar pide su correo exacto y el código", async () => {
    await dangerRegion(page).getByRole("button", { name: "Eliminar cuenta" }).click();
    await expect(dialog(page)).toHaveAccessibleName("¿Eliminar la cuenta de Carla Acciones?");
    expect(await seriousViolations(page), "ventana de eliminar").toEqual([]);
    const submit = dialog(page).getByRole("button", { name: "Eliminar cuenta" });
    await dialog(page).getByLabel(/Escribe su correo/).fill("otra@finanzas-e2e.test");
    await expect(submit).toBeDisabled();
    await dialog(page).getByLabel(/Escribe su correo/).fill(carla.email.toUpperCase());
    await expect(submit).toBeEnabled();
    // Con el botón rojo ya activo (axe no revisa el contraste de los botones desactivados).
    expect(await seriousViolations(page), "ventana de eliminar, lista para enviar").toEqual([]);
    await confirmWith(page, codeFor(secret, 1), "Eliminar cuenta");
  });

  await test.step("vuelve a la lista con el aviso; la cuenta y su sesión ya no existen", async () => {
    await expect(toast(page, "Se eliminó la cuenta")).toHaveAttribute("data-tone", "removal");
    // El aviso venía en la URL (?aviso=cuenta-eliminada) y se quita al mostrarlo.
    await expect(page).toHaveURL(/\/admin\/usuarios$/);
    await page.goto(`/admin/usuarios?q=${encodeURIComponent(carla.email)}`);
    await expect(visible(page.getByText("No hay cuentas con estos filtros.", { exact: true }))).toBeVisible();
    await carla.page.reload();
    await expect(carla.page).toHaveURL(/\/login/);
  });

  await test.step("en el Historial: 'eliminó una cuenta', sin sus datos, y nada más de ella", async () => {
    await page.goto(`/admin/historial?q=${encodeURIComponent(carla.email)}`);
    await expect(visible(page.getByText("No hay eventos con estos filtros.", { exact: true }))).toBeVisible();
    await page.goto(`/admin/historial?q=${carla.phone}`);
    await expect(visible(page.getByText("No hay eventos con estos filtros.", { exact: true }))).toBeVisible();
    await page.goto("/admin/historial?tipo=admin&fecha=hoy");
    const deleted = visible(page.locator("main ol > li")).filter({ hasText: "Ana Admin eliminó una cuenta" });
    await expect(deleted.first()).toContainText("Sin datos de la cuenta");
    await expect(deleted.first()).not.toContainText(carla.email);
  });

  await carla.page.context().close();
});

test("suspender deja a la persona fuera de la web y del bot, sin decirle el motivo; reactivar lo devuelve todo @principal", async ({
  page,
  browser,
  request,
}) => {
  const fran = await personWithWhatsApp(browser, "Fran Suspendida", request);
  const { secret } = await adminOnAccount(page, fran.email);
  const reason = "Comparte la cuenta con otra persona";

  await test.step("suspender, con un motivo que solo ve el admin", async () => {
    await dangerRegion(page).getByRole("button", { name: "Suspender" }).click();
    await expect(dialog(page)).toHaveAccessibleName("¿Suspender la cuenta de Fran Suspendida?");
    await dialog(page).getByLabel(/Motivo/).fill(reason);
    await confirmWith(page, codeFor(secret), "Suspender");
    await expect(status(page)).toHaveText("Se suspendió la cuenta de Fran Suspendida.");
    await expect(visible(page.getByText("Suspendida", { exact: true })).first()).toBeVisible();
    await expect(visible(page.locator("dt", { hasText: /^Estado$/ }).locator("xpath=following-sibling::dd[1]"))).toContainText(
      `Motivo: ${reason}`,
    );
    await expect(actionsRegion(page).getByRole("button", { name: "Reactivar" })).toBeVisible();
    await expect(dangerRegion(page).getByRole("button", { name: "Suspender" })).toHaveCount(0);
    await expect(adminActions(page).first()).toContainText("Ana Admin suspendió la cuenta de Fran Suspendida");
    await expect(adminActions(page).first()).toContainText(`motivo: ${reason}`);
  });

  await test.step("Fran queda fuera: su sesión se cerró y al entrar ve que está suspendida, sin el motivo", async () => {
    await fran.page.reload();
    await expect(fran.page).toHaveURL(/\/login/);
    await logIn(fran.page, fran.email);
    const alert = visible(fran.page.getByRole("alert").filter({ hasText: "Tu cuenta está suspendida" }));
    await expect(alert).toContainText("Si crees que es un error, escríbenos a");
    await expect(alert).not.toContainText(reason);
    await expect(fran.page).not.toHaveURL(/\/dashboard$/);
  });

  await test.step("el bot no registra lo que escriba", async () => {
    await sendWhatsApp(request, fran.phone, "gasté 20 mil en almuerzo");
    const reply = await nthReply(request, fran.phone, 2);
    expect(reply).toContain("Tu cuenta está suspendida, así que no puedo registrar movimientos");
    expect(reply).not.toContain(reason);
  });

  await test.step("en Usuarios, el chip 'Suspendidas' la encuentra", async () => {
    await page.goto(`/admin/usuarios?estado=suspendidas&q=${encodeURIComponent(fran.email)}`);
    const row = visible(page.getByRole("list", { name: "Cuentas" })).getByRole("listitem");
    await expect(row).toHaveCount(1);
    await expect(row.first()).toContainText("Suspendida");
    await expect(visible(page.getByRole("link", { name: "Quitar filtro: Suspendidas" }))).toBeVisible();
    await row.first().getByRole("link").click();
  });

  await test.step("reactivar: Fran vuelve a entrar y el bot vuelve a registrar", async () => {
    await actionsRegion(page).getByRole("button", { name: "Reactivar" }).click();
    await confirmWith(page, codeFor(secret, 1), "Reactivar");
    await expect(status(page)).toHaveText("Se reactivó la cuenta de Fran Suspendida.");
    await expect(dangerRegion(page).getByRole("button", { name: "Suspender" })).toBeVisible();
    await expect(adminActions(page).first()).toContainText("Ana Admin reactivó la cuenta de Fran Suspendida");

    await logIn(fran.page, fran.email);
    await expect(fran.page).toHaveURL(/\/dashboard$/);
    await sendWhatsApp(request, fran.phone, "gasté 20 mil en almuerzo");
    expect(await nthReply(request, fran.phone, 3)).not.toContain("suspendida");
  });

  await fran.page.context().close();
});

test("cinco códigos equivocados bloquean las acciones y también el inicio de sesión del admin", async ({ page, browser, request }) => {
  const dani = await personWithWhatsApp(browser, "Dani Bloqueo", request);
  const { secret, adminEmail } = await adminOnAccount(page, dani.email);

  await actionsRegion(page).getByRole("button", { name: "Desvincular" }).click();
  for (const left of ["4 intentos", "3 intentos", "2 intentos", "1 intento"]) {
    await confirmWith(page, wrongCode(secret), "Desvincular");
    await expect(dialog(page).getByText(new RegExp(`Te quedan? ${left}\\.`))).toBeVisible();
  }
  await confirmWith(page, wrongCode(secret), "Desvincular");
  await expect(dialog(page).getByText(/las acciones y tu inicio de sesión están bloqueados hasta las? \d/)).toBeVisible();
  // Ni el correcto pasa, y el WhatsApp de Dani sigue vinculado.
  await confirmWith(page, codeFor(secret), "Desvincular");
  await expect(dialog(page).getByText(/^Por demasiados códigos equivocados/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actionsRegion(page).getByRole("button", { name: "Desvincular" })).toBeVisible();

  // Al volver a entrar, el segundo paso también está bloqueado (el mismo contador que Better Auth).
  await logOut(page);
  await logIn(page, adminEmail);
  await expect(heading(page, "Verificación en dos pasos")).toBeVisible();
  await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(visible(page.getByRole("alert").filter({ hasText: "Demasiados códigos incorrectos" }))).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);

  await dani.page.context().close();
});

test("en su propia cuenta y en la de otro admin no hay acciones", async ({ page, browser }) => {
  const other = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } })).newPage();
  const otherEmail = await newAdmin(other);
  await other.context().close();

  const adminEmail = await newAdmin(page);
  await setUpTwoFactor(page);
  for (const email of [adminEmail, otherEmail]) {
    await page.goto(`/admin/usuarios?q=${encodeURIComponent(email)}`);
    await visible(page.getByRole("list", { name: "Cuentas" })).getByRole("link").first().click();
    await expect(visible(page.getByRole("heading", { name: "Sesiones abiertas" })), email).toBeVisible();
    await expect(page.getByRole("region", { name: "Acciones" }), email).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Zona de peligro" }), email).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eliminar cuenta" }), email).toHaveCount(0);
  }
});

test("en celular y en modo oscuro, las ventanas se ven completas y sin problemas de accesibilidad", async ({ page, browser, request }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const eva = await personWithWhatsApp(browser, "Eva Celular", request);
  await adminOnAccount(page, eva.email);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  expect(await seriousViolations(page), "detalle con acciones").toEqual([]);

  for (const [region, button] of [
    [actionsRegion, "Desvincular"],
    [dangerRegion, "Suspender"],
    [dangerRegion, "Eliminar cuenta"],
  ] as const) {
    await region(page).getByRole("button", { name: button }).click();
    await expect(dialog(page)).toBeVisible();
    if (button === "Eliminar cuenta") {
      await dialog(page).getByLabel(/Escribe su correo/).fill(eva.email);
      // Con el botón rojo activo y el mouse encima: también así debe leerse.
      await dialog(page).getByRole("button", { name: "Eliminar cuenta" }).hover();
    }
    if (button === "Suspender") await dialog(page).getByRole("button", { name: "Suspender" }).hover();
    const box = (await dialog(page).boundingBox())!;
    expect(box.x, button).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, button).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), button).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), button).toEqual([]);
    await dialog(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog(page)).toHaveCount(0);
  }

  await eva.page.context().close();
});
