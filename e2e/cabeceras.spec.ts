import { expect } from "@playwright/test";
import { contentSecurityPolicy } from "../src/lib/security-headers";
import { test } from "./helpers";

// Las cabeceras de seguridad llegan en todas las respuestas del build de producción: páginas,
// redirecciones del proxy y rutas de API.
const PATHS = ["/", "/login", "/privacidad", "/dashboard", "/api/health", "/api/whatsapp/webhook"];

for (const path of PATHS) {
  test(`${path} responde con las cabeceras de seguridad`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();

    expect(headers["content-security-policy"]).toBe(contentSecurityPolicy());
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
}

test("ninguna página se puede mostrar dentro de un iframe de otro sitio", async ({
  page,
  baseURL,
  cspViolations,
}) => {
  await page.setContent(`<iframe id="app" src="${baseURL}/login"></iframe>`);

  // El navegador se niega a cargarla y lo registra como violación de frame-ancestors.
  await expect.poll(() => cspViolations.join("\n")).toContain("frame-ancestors 'none'");
  await expect(page.frameLocator("#app").getByRole("button", { name: "Entrar" })).toHaveCount(0);
  cspViolations.length = 0; // esa violación es justo lo que se esperaba
});
