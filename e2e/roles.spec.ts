import { expect } from "@playwright/test";
import { adminTab } from "./admin";
import { PASSWORD, fakeIp, register, test, uniqueEmail } from "./helpers";

// Contra el build de producción: alguien con sesión (o al registrarse) intenta darse el rol de admin
// llamando directo a la API de Better Auth, como lo haría con curl. Nada de eso debe funcionar.

test("una cuenta recién registrada es usuario y no puede volverse admin desde la API", async ({ page, baseURL }) => {
  await register(page);
  await expect(adminTab(page)).toHaveCount(0);

  // Con el Origin de la app, como lo mandaría el navegador (o alguien que lo copia en curl): la ruta
  // "actualizar perfil" ni siquiera existe (src/modules/auth/http-routes.ts).
  const headers = { origin: new URL(baseURL!).origin };
  for (const data of [{ role: "admin" }, { name: "Ana Admin", role: "admin" }, { role: ["admin"] }]) {
    const response = await page.request.post("/api/auth/update-user", { data, headers });
    expect(response.status(), JSON.stringify(data)).toBe(404);
  }

  // Sigue siendo usuario y la app funciona normal para esa cuenta.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(adminTab(page)).toHaveCount(0);
});

test("sin el Origin de la app, Better Auth rechaza el pedido antes de mirarlo (protección CSRF)", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, "Ana Pérez", email);
  const response = await page.request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" });
});

test("registrarse mandando role: admin deja la cuenta como usuario", async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "Intruso", email: uniqueEmail(), password: PASSWORD, role: "admin" },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).user.role).toBe("user");
  await request.dispose();
});

test("los endpoints de administración de Better Auth no existen", async ({ page }) => {
  await register(page);
  for (const path of ["/api/auth/admin/set-role", "/api/auth/admin/list-users", "/api/auth/admin/impersonate-user"]) {
    const response = await page.request.post(path, { data: { userId: "x", role: "admin" } });
    expect(response.status(), path).toBe(404);
  }
  await page.goto("/dashboard");
  await expect(adminTab(page)).toHaveCount(0);
});

test("las rutas de Better Auth que la app no usa responden 404, aunque haya sesión", async ({ page, baseURL }) => {
  await register(page);
  const headers = { origin: new URL(baseURL!).origin };
  // Con una sesión robada, estas dejaban averiguar la contraseña o cambiarla.
  for (const path of ["/verify-password", "/change-password", "/update-user", "/revoke-sessions", "/sign-out"]) {
    const response = await page.request.post(`/api/auth${path}`, { data: { password: "x" }, headers });
    expect(response.status(), path).toBe(404);
  }
  for (const path of ["/get-session", "/list-sessions", "/ok", "/callback/google"]) {
    expect((await page.request.get(`/api/auth${path}`)).status(), path).toBe(404);
  }
  // La sesión sigue abierta: nada de lo anterior la tocó.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
