import { expect, type Page } from "@playwright/test";
import { TOO_MANY_ATTEMPTS } from "../src/lib/auth-errors";
import { PASSWORD, fakeIp, formAlert, newPerson, register, test, uniqueEmail } from "./helpers";

test.describe("sin sesión", () => {
  for (const path of ["/dashboard", "/ingresos", "/egresos"]) {
    test(`${path} manda al login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    });
  }

  test("robots.txt es público y pide a los buscadores no entrar a la parte privada", async ({ request, baseURL }) => {
    const response = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    for (const path of ["/dashboard", "/ingresos", "/egresos", "/api/"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    // La URL de la app con la que corre, no con la que se compiló (en el CI y en Vercel, sin la de producción).
    expect(body).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test("sitemap.xml es público y cada página que lista se ve sin sesión", async ({ request, baseURL }) => {
    const response = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    // Con la URL de la app con la que corre (BETTER_AUTH_URL), no con la que se compiló.
    const locs = [...(await response.text()).matchAll(/<loc>(.+?)<\/loc>/g)].map(([, loc]) => loc);
    const paths = ["/", "/registro", "/login", "/privacidad", "/eliminar-datos"];
    expect(locs).toEqual(paths.map((path) => (path === "/" ? baseURL : `${baseURL}${path}`)));
    for (const path of paths) {
      const page = await request.get(path, { maxRedirects: 0 });
      expect(page.status(), path).toBe(200);
    }
  });

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

  test("bloquea los intentos de login después del tercero y avisa en español", async ({ page }) => {
    await wrongPasswordAttempts(page, uniqueEmail(), 4);
    await expect(formAlert(page)).toHaveText(TOO_MANY_ATTEMPTS);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("bloqueo por cuenta", () => {
  // Aunque cada intento salga de otra IP (así se esquiva el límite por IP), tras 5 contraseñas
  // equivocadas la cuenta queda bloqueada: ni la correcta entra.
  test("tras 5 intentos fallidos desde IPs distintas bloquea la cuenta y lo explica", async ({ browser }) => {
    const signup = await newPerson(browser);
    const { email } = await register(signup);
    await signup.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Correo").fill(email);
    for (let i = 0; i < 5; i++) {
      await context.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
      await page.getByLabel("Contraseña").fill(`equivocada-${i}-123`);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(formAlert(page)).toHaveText("Correo o contraseña incorrectos.");
    }

    await context.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(formAlert(page)).toHaveText(
      "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta de nuevo en 15 minutos.",
    );
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });
});

test.describe("sin JavaScript (antes de que cargue la página)", () => {
  // Si alguien envía el formulario antes de que cargue el JavaScript (o si falla), el navegador
  // lo envía por su cuenta: la contraseña no debe terminar en la URL (historial, logs, Referer).
  for (const [path, button] of [
    ["/login", "Entrar"],
    ["/registro", "Crear cuenta"],
  ] as const) {
    test(`${path} no pone la contraseña en la URL`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(path);
      if (path === "/registro") await page.getByLabel("Nombre").fill("Ana");
      await page.getByLabel("Correo").fill(uniqueEmail());
      await page.getByLabel("Contraseña").fill("secreto-que-no-debe-verse");
      await page.getByRole("button", { name: button }).click();
      await page.waitForLoadState();

      expect(page.url()).not.toContain("secreto-que-no-debe-verse");
      expect(page.url()).not.toContain("password");
      await context.close();
    });
  }
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
