import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { totp } from "../test/totp";
import { newAdmin, setUpTwoFactor, wrongCode } from "./admin";
import { addTransaction, goToAccount, goToWhatsApp, logIn, logOut, openTab, PASSWORD, register, test, toast, visible } from "./helpers";
import { newPhone, nthReply, sendWhatsApp } from "./whatsapp";

// Accesibilidad con axe-core (reglas WCAG 2.1 A y AA): falla ante problemas graves o críticos,
// como contraste insuficiente, campos sin etiqueta o botones sin nombre. Todo se revisa en modo claro
// y en modo oscuro, y los botones principales también activos y con el mouse encima: axe no revisa el
// contraste de un botón deshabilitado, y un efecto al pasar el mouse puede bajarlo.
async function seriousViolations(page: Page, { only, waitForAnimations = true }: { only?: string; waitForAnimations?: boolean } = {}) {
  // Sin animaciones a medias: un botón que todavía cambia de color daría un contraste falso. (El
  // esqueleto de carga titila sin parar: ahí no se espera.)
  if (waitForAnimations) {
    // Dos cuadros: una transición que recién empieza (un botón que deja de estar deshabilitado)
    // todavía no aparece en getAnimations().
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    // La barrita del tiempo de los avisos emergentes (toast-timer) no cambia colores: no se espera.
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running" || (a as CSSAnimation).animationName === "toast-timer"),
    );
  }
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (only) builder = builder.include(only);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      regla: v.id,
      impacto: v.impact,
      problema: v.help,
      elementos: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
    }));
}

/** Pasa el mouse sobre el elemento y revisa solo ese elemento (activo y con el efecto puesto). */
async function hoveredViolations(page: Page, element: Locator) {
  await expect(element).toBeEnabled();
  await element.hover();
  await element.evaluate((el) => el.setAttribute("data-axe-hover", ""));
  const found = await seriousViolations(page, { only: "[data-axe-hover]" });
  await element.evaluate((el) => el.removeAttribute("data-axe-hover"));
  return found;
}

const SCHEMES = { light: "modo claro", dark: "modo oscuro" } as const;

for (const [colorScheme, scheme] of Object.entries(SCHEMES) as [keyof typeof SCHEMES, string][]) {
  test.describe(scheme, () => {
    test.use({ colorScheme });

    test.describe("páginas públicas", () => {
      for (const path of ["/", "/login", "/registro", "/privacidad", "/eliminar-datos", "/cuenta-eliminada"]) {
        test(`${path} no tiene problemas graves de accesibilidad`, async ({ page }) => {
          await page.goto(path);
          expect(await seriousViolations(page)).toEqual([]);
        });
      }

      test("los botones principales, con el mouse encima", async ({ page }) => {
        for (const [path, name] of [
          ["/", "Crear cuenta"],
          ["/cuenta-eliminada", "Crear una cuenta nueva"],
        ] as const) {
          await page.goto(path);
          const button = visible(page.getByRole("link", { name }));
          expect(await hoveredViolations(page, button), `${path}: ${name}`).toEqual([]);
        }
      });
    });

    test("el registro con la sugerencia de correo visible tampoco", async ({ page }) => {
      await page.goto("/registro");
      const email = page.getByLabel("Correo", { exact: true });
      await email.fill("ana@gmal.com");
      await email.blur();
      await expect(visible(page.getByText(/Quisiste decir/))).toBeVisible();

      // El campo conserva su nombre y la sugerencia queda como su descripción.
      await expect(page.getByRole("textbox", { name: "Correo", exact: true })).toHaveAccessibleDescription(
        /Quisiste decir ana@gmail\.com/,
      );
      expect(await seriousViolations(page)).toEqual([]);
    });

    test("el login con un error y su botón con el mouse encima", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Correo").fill("nadie@finanzas-e2e.test");
      await page.getByLabel("Contraseña").fill("una-clave-equivocada");
      expect(await hoveredViolations(page, page.getByRole("button", { name: "Entrar" }))).toEqual([]);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(visible(page.getByRole("alert"))).toBeVisible();
      // El botón vuelve de "deshabilitado" con una transición: se revisa ya en su color final.
      await expect(page.getByRole("button", { name: "Entrar" })).toHaveCSS("opacity", "1");
      expect(await seriousViolations(page)).toEqual([]);
    });

    test.describe("páginas con sesión (y con datos)", () => {
      test.beforeEach(async ({ page }) => {
        await register(page);
        await openTab(page, "Egresos");
        await addTransaction(page, { amount: "120000", description: "Mercado", category: "Mercado" });
        await expect(toast(page, /^Egreso registrado$/)).toBeVisible();
      });

      for (const tab of ["Resumen", "Ingresos", "Egresos"] as const) {
        test(`${tab} no tiene problemas graves de accesibilidad`, async ({ page }) => {
          await openTab(page, tab);
          expect(await seriousViolations(page)).toEqual([]);
        });
      }

      test("el formulario de un movimiento, listo para enviar y con el mouse en el botón", async ({ page }) => {
        await openTab(page, "Ingresos");
        const form = visible(page.locator("form").filter({ has: page.getByLabel("Monto") }));
        await form.getByLabel("Monto").fill("50000");
        await form.getByLabel("Descripción").fill("Venta");
        expect(await hoveredViolations(page, form.getByRole("button", { name: "Registrar ingreso" }))).toEqual([]);
      });

      test("el esqueleto de carga tampoco", async ({ page }) => {
        // Demora la respuesta del servidor al cambiar de pestaña: mientras tanto se ve el esqueleto.
        await page.route(/\/ingresos(\?|$)/, async (route) => {
          if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, 2_000));
          await route.continue();
        });
        await page.getByRole("navigation").getByRole("link", { name: "Ingresos", exact: true }).click();

        await expect(visible(page.getByRole("status", { name: "Cargando" }))).toBeVisible();
        // Solo el esqueleto: mientras la respuesta no llega, Next todavía no puso el <title> de la
        // página nueva (las demás pruebas revisan la página completa ya cargada).
        expect(await seriousViolations(page, { only: "[role=status]", waitForAnimations: false })).toEqual([]);
      });

      test("la página 404 tampoco", async ({ page }) => {
        await page.goto("/esta-pagina-no-existe");
        await expect(visible(page.getByRole("heading", { name: "No encontramos esta página" }))).toBeVisible();
        expect(await seriousViolations(page)).toEqual([]);
        expect(await hoveredViolations(page, visible(page.getByRole("link", { name: "Volver al inicio" })))).toEqual([]);
      });

      test("Mi cuenta tampoco, ni con el botón de eliminar activo y el mouse encima @principal", async ({ page }) => {
        await goToAccount(page);
        await expect(visible(page.getByRole("heading", { name: "Mi cuenta", exact: true }))).toBeVisible();
        await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
        expect(await seriousViolations(page)).toEqual([]);

        await page.getByLabel("Tu contraseña").fill(PASSWORD);
        await page.getByLabel(/Escribe ELIMINAR/).fill("ELIMINAR");
        const remove = page.getByRole("button", { name: "Eliminar mi cuenta para siempre" });
        expect(await seriousViolations(page)).toEqual([]);
        expect(await hoveredViolations(page, remove)).toEqual([]);
      });

      test("la página para editar un movimiento tampoco", async ({ page }) => {
        await visible(page.getByRole("link", { name: "Editar Mercado" })).click();
        await expect(page).toHaveURL(/\/editar$/);
        await expect(visible(page.getByRole("heading", { name: "Editar movimiento" }))).toBeVisible();
        await expect(visible(page.locator("[aria-busy=true]"))).toHaveCount(0);
        expect(await seriousViolations(page)).toEqual([]);
        expect(await hoveredViolations(page, visible(page.getByRole("button", { name: "Guardar cambios" })))).toEqual([]);
      });

      test("los errores del formulario tampoco", async ({ page }) => {
        await addTransaction(page, { amount: "0", description: "Inválido" });
        await expect(visible(page.getByText("Ingresa un monto mayor que cero"))).toBeVisible();
        expect(await seriousViolations(page)).toEqual([]);
      });
    });

    test("conectar WhatsApp: el botón, el código y el número ya vinculado @principal", async ({ page, request }) => {
      await register(page);
      await goToWhatsApp(page);
      const connect = visible(page.getByRole("button", { name: "Conectar WhatsApp" }));
      expect(await hoveredViolations(page, connect)).toEqual([]);
      await connect.click();
      const code = (await visible(page.getByText(/^VINCULAR \d{6}$/)).textContent())!;
      expect(await seriousViolations(page), "con el código").toEqual([]);

      const phone = newPhone();
      await sendWhatsApp(request, phone, code);
      await nthReply(request, phone, 1);
      await page.reload();
      const unlink = visible(page.getByRole("button", { name: "Desvincular número" }));
      await expect(unlink).toBeVisible();
      expect(await seriousViolations(page), "vinculado").toEqual([]);
      expect(await hoveredViolations(page, unlink)).toEqual([]);
    });

    test("la verificación en dos pasos del admin: configurarla y el segundo paso del login con un error", async ({ page }) => {
      const email = await newAdmin(page);
      const { secret } = await setUpTwoFactor(page, { checkA11y: true });
      await logOut(page);
      await logIn(page, email);
      const verify = page.getByRole("button", { name: "Verificar" });
      await page.getByLabel("Código de 6 dígitos").fill(wrongCode(secret));
      expect(await hoveredViolations(page, verify)).toEqual([]);
      await verify.click();
      await expect(visible(page.getByRole("alert").filter({ hasText: "Código incorrecto" }))).toBeVisible();
      await expect(verify).toHaveCSS("opacity", "1");
      expect(await seriousViolations(page)).toEqual([]);
      // Y entra con el código correcto (la prueba deja todo como estaba).
      await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
      await verify.click();
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  });
}
