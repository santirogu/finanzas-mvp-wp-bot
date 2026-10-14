import { expect, type Page } from "@playwright/test";
import { PASSWORD, formAlert, newPerson, register, test, uniqueEmail } from "./helpers";

test.describe("sin sesión", () => {
  for (const path of ["/dashboard", "/ingresos", "/egresos"]) {
    test(`${path} manda al login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    });
  }

  test("la política de privacidad y la página para eliminar datos son públicas", async ({ page }) => {
    for (const path of ["/privacidad", "/eliminar-datos"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });
});

test.describe("iniciar sesión", () => {
  test("con la contraseña correcta entra; con una equivocada, avisa sin entrar", async ({ browser }) => {
    const signup = await newPerson(browser);
    const { email } = await register(signup, "Beto");
    await signup.close();

    const page = await newPerson(browser);
    await page.goto("/login");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill("otra-clave-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(formAlert(page)).toHaveText("Correo o contraseña incorrectos.");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Hola, Beto")).toBeVisible();
    await page.close();
  });

  test("con sesión, el login y el registro mandan al dashboard", async ({ page }) => {
    await register(page);
    for (const path of ["/login", "/registro", "/"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/dashboard$/);
    }
  });

  test("el simulador de WhatsApp no existe en producción", async ({ page }) => {
    await register(page);
    const response = await page.goto("/simulador");
    expect(response?.status()).toBe(404);
  });
});

test.describe("límite de intentos (Better Auth)", () => {
  // Better Auth permite 3 intentos de login cada 10 segundos por IP: protege contra quien prueba
  // contraseñas a la fuerza. Todos los intentos de esta prueba salen de la misma IP.
  async function wrongPasswordAttempts(page: Page, email: string, times: number) {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(email);
    for (let i = 0; i < times; i++) {
      await page.getByLabel("Contraseña").fill(`equivocada-${i}-123`);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
    }
  }

  test("bloquea los intentos de login después del tercero", async ({ page }) => {
    await wrongPasswordAttempts(page, uniqueEmail(), 4);
    // Hoy el aviso llega en inglés (ver la prueba siguiente); acepta ambos para no depender de eso.
    await expect(formAlert(page)).toHaveText(/too many requests|espera/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  // Falla conocida: el aviso llega en inglés ("Too many requests. Please try again later.").
  // Se corrige en una rama fix/; luego quitar `test.fail`.
  test.fail("avisa en español que hay que esperar", async ({ page }) => {
    await wrongPasswordAttempts(page, uniqueEmail(), 4);
    await expect(formAlert(page)).toHaveText(/espera/i, { timeout: 2_000 });
  });
});

test.describe("registro", () => {
  test("no permite dos cuentas con el mismo correo", async ({ browser }) => {
    const first = await newPerson(browser);
    const { email } = await register(first);
    await first.close();

    const page = await newPerson(browser);
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Otra persona");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(formAlert(page)).toHaveText("Ya existe una cuenta con ese correo.");
    await page.close();
  });

  test("sugiere corregir un dominio mal escrito", async ({ page }) => {
    await page.goto("/registro");
    const email = page.getByLabel("Correo");
    await email.fill("ana@gmal.com");
    await email.blur();

    await expect(page.getByText("¿Quisiste decir ana@gmail.com?")).toBeVisible();
    await page.getByRole("button", { name: "Sí, corregir" }).click();
    await expect(email).toHaveValue("ana@gmail.com");
  });

  test("exige una contraseña de al menos 8 caracteres", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Correo").fill(uniqueEmail());
    await page.getByLabel("Contraseña").fill("corta");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page).toHaveURL(/\/registro$/);
    expect(await page.getByLabel("Contraseña").evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
  });
});
