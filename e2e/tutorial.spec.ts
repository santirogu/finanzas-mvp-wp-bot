import { expect, type Page } from "@playwright/test";
import { seriousViolations } from "./admin";
import { closeTutorial, logIn, logOut, register, test, tutorial, uniqueEmail, visible } from "./helpers";

// El tutorial de bienvenida (src/components/welcome-tutorial.tsx): una cuenta nueva lo ve al entrar al Resumen hasta
// que lo termina o lo omite (queda en la cuenta, no en el navegador); desde Ayuda se vuelve a ver.

const step = (page: Page) => page.getByRole("dialog").getByRole("heading", { level: 2 });

test("una cuenta nueva ve el tutorial en el Resumen, lo recorre y no vuelve a salir @principal @safari", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email, { keepTutorial: true });
  const dialog = tutorial(page);

  await test.step("se abre solo, con el foco en Siguiente y sin problemas de accesibilidad (claro y oscuro)", async () => {
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Siguiente" })).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await seriousViolations(page)).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  await test.step("cinco pasos cortos, con Atrás desde el segundo", async () => {
    for (const title of ["Tu mes de un vistazo", "Anota por WhatsApp", "Tus gastos fijos", "Cómo te va"]) {
      await page.getByRole("dialog").getByRole("button", { name: "Siguiente" }).click();
      await expect(step(page)).toHaveText(title);
    }
    await page.getByRole("dialog").getByRole("button", { name: "Atrás" }).click();
    await expect(step(page)).toHaveText("Tus gastos fijos");
    await page.getByRole("dialog").getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Omitir" })).toHaveCount(0);
  });

  await test.step("Empezar lo cierra; ni al recargar ni en otra sesión vuelve a salir", async () => {
    await closeTutorial(page, "Empezar");
    await page.reload();
    await expect(visible(page.getByText("Balance del mes"))).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await logOut(page);
    await logIn(page, email);
    await expect(visible(page.getByText("Balance del mes"))).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("Omitir lo cierra para siempre; desde Ayuda se vuelve a ver", async ({ page }) => {
  await register(page, "Ana Pérez", uniqueEmail(), { keepTutorial: true });
  await expect(tutorial(page)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Siguiente" }).click();
  await closeTutorial(page, "Omitir");

  await page.goto("/ayuda");
  await visible(page.getByRole("button", { name: "Ver el tutorial de bienvenida" })).click();
  await expect(tutorial(page)).toBeVisible();
  await expect(step(page)).toHaveText("Te damos la bienvenida a Anotado");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(visible(page.getByRole("button", { name: "Ver el tutorial de bienvenida" }))).toBeFocused();

  await page.goto("/dashboard");
  await expect(visible(page.getByText("Balance del mes"))).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Conectar WhatsApp lleva a Mi cuenta con la ventana cerrada (la página no queda bloqueada)", async ({ page }) => {
  await register(page, "Ana Pérez", uniqueEmail(), { keepTutorial: true });
  for (let i = 0; i < 2; i++) await page.getByRole("dialog").getByRole("button", { name: "Siguiente" }).click();
  const saved = page.waitForResponse((response) => response.request().method() === "POST" && "next-action" in response.request().headers());
  await page.getByRole("dialog").getByRole("link", { name: "Conectar WhatsApp" }).click();
  await expect(page).toHaveURL(/\/cuenta#whatsapp$/);
  expect((await saved).ok()).toBe(true);
  // Se puede usar la página: el botón responde.
  await visible(page.getByRole("button", { name: "Conectar WhatsApp" })).click();
  await expect(visible(page.getByText(/^VINCULAR \d{6}$/))).toBeVisible();

  await page.goto("/dashboard");
  await expect(visible(page.getByText("Balance del mes"))).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
