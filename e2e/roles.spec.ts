import { expect } from "@playwright/test";
import { PASSWORD, fakeIp, register, test, uniqueEmail } from "./helpers";

// Contra el build de producción: alguien con sesión (o al registrarse) intenta darse el rol de admin
// llamando directo a la API de Better Auth, como lo haría con curl. Nada de eso debe funcionar.

async function sessionRole(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  return (await response.json())?.user?.role;
}

test("una cuenta recién registrada es usuario y no puede volverse admin desde la API", async ({ page, baseURL }) => {
  await register(page);
  expect(await sessionRole(page.request)).toBe("user");

  // Con el Origin de la app, como lo mandaría el navegador (o alguien que lo copia en curl).
  const headers = { origin: new URL(baseURL!).origin };
  for (const data of [{ role: "admin" }, { name: "Ana Admin", role: "admin" }, { role: ["admin"] }]) {
    const response = await page.request.post("/api/auth/update-user", { data, headers });
    expect(response.status(), JSON.stringify(data)).toBe(400);
    expect(await response.json()).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
  }

  expect(await sessionRole(page.request)).toBe("user");
  // Y la app sigue funcionando normal para esa cuenta.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sin el Origin de la app, Better Auth rechaza el pedido antes de mirarlo (protección CSRF)", async ({ page }) => {
  await register(page);
  const response = await page.request.post("/api/auth/update-user", { data: { role: "admin" } });
  expect(response.status()).toBe(403);
  expect(await sessionRole(page.request)).toBe("user");
});

test("registrarse mandando role: admin deja la cuenta como usuario", async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "Intruso", email: uniqueEmail(), password: PASSWORD, role: "admin" },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).user.role).toBe("user");
  expect(await sessionRole(request)).toBe("user");
  await request.dispose();
});

test("los endpoints de administración de Better Auth no existen", async ({ page }) => {
  await register(page);
  for (const path of ["/api/auth/admin/set-role", "/api/auth/admin/list-users", "/api/auth/admin/impersonate-user"]) {
    const response = await page.request.post(path, { data: { userId: "x", role: "admin" } });
    expect(response.status(), path).toBe(404);
  }
  expect(await sessionRole(page.request)).toBe("user");
});
