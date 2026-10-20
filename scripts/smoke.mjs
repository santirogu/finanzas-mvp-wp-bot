#!/usr/bin/env node
// Smoke tests del despliegue: revisan en segundos que una versión publicada funcione. El job
// "Desplegar a producción" los corre antes de pasarle el dominio a la versión nueva (contra su
// URL propia, sin tráfico) y después (contra el dominio real); si fallan, no la publica o vuelve
// a la anterior. No inician sesión, no guardan datos ni llaman a Claude o WhatsApp.
//
// Uso: node scripts/smoke.mjs <url>        (o pnpm smoke <url>)
// Si la URL tiene la protección de despliegues de Vercel, define VERCEL_AUTOMATION_BYPASS_SECRET.
// Sin dependencias: corre en el CI sin instalar paquetes.

import { pathToFileURL } from "node:url";

/**
 * @typedef {{
 *   name: string,
 *   path: string,
 *   status: number,
 *   method?: string,
 *   headers?: Record<string, string>,
 *   body?: string,
 *   contains?: string,
 *   responseHeaders?: Record<string, string>,
 * }} Check
 */

/** @type {Check[]} */
export const CHECKS = [
  { name: "La página de inicio de sesión carga", path: "/login", status: 200, contains: "Entrar" },
  {
    name: "Las cabeceras de seguridad están activas",
    path: "/login",
    status: 200,
    responseHeaders: {
      "content-security-policy": "frame-ancestors 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "strict-transport-security": "max-age=",
    },
  },
  { name: "La política de privacidad es pública (la exige Meta)", path: "/privacidad", status: 200 },
  { name: "La página para eliminar datos es pública (la exige Meta)", path: "/eliminar-datos", status: 200 },
  // Se arman en cada pedido con la URL de la app: si la leyeran al compilar, dirían http://localhost:3000.
  { name: "El sitemap es público y lleva la URL de producción", path: "/sitemap.xml", status: 200, contains: "<loc>https://" },
  { name: "robots.txt es público y apunta al sitemap de producción", path: "/robots.txt", status: 200, contains: "Sitemap: https://" },
  {
    name: "La base de datos responde, tiene todas las migraciones y no falta configuración",
    path: "/api/health",
    status: 200,
    contains: '"status":"ok"',
  },
  {
    name: "El webhook de WhatsApp rechaza un token de verificación falso",
    path: "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=smoke-test-token-falso&hub.challenge=smoke",
    status: 403,
  },
  {
    name: "El webhook de WhatsApp rechaza mensajes con firma falsa",
    path: "/api/whatsapp/webhook",
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
    body: "{}",
    status: 401,
  },
];

// Así se identifican los pedidos de los smoke tests en los logs (p. ej. el aviso de firma
// inválida del webhook), para no confundirlos con un intento real.
export const SMOKE_USER_AGENT = "finanzas-smoke-test";

// La protección de despliegues de Vercel redirige a su inicio de sesión.
const VERCEL_LOGIN = /^https:\/\/vercel\.com\/(sso-api|login)/;

/**
 * Ejecuta un chequeo una vez.
 * @returns {Promise<{ ok: boolean, detail?: string, retry?: boolean }>}
 */
export async function runCheck(baseUrl, check, { fetch = globalThis.fetch, bypassSecret, timeoutMs = 20_000 } = {}) {
  const headers = { "user-agent": SMOKE_USER_AGENT, ...check.headers };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  let response;
  try {
    response = await fetch(new URL(check.path, baseUrl), {
      method: check.method ?? "GET",
      headers,
      body: check.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, detail: `no respondió (${error?.message ?? error})`, retry: true };
  }

  const location = response.headers.get("location") ?? "";
  if (VERCEL_LOGIN.test(location)) {
    return {
      ok: false,
      detail: bypassSecret
        ? "la URL está protegida por Vercel y VERCEL_AUTOMATION_BYPASS_SECRET no es válido"
        : "la URL está protegida por Vercel: define VERCEL_AUTOMATION_BYPASS_SECRET",
      retry: false,
    };
  }
  if (response.status !== check.status) {
    const redirect = location ? ` → ${location}` : "";
    return { ok: false, detail: `respondió ${response.status}${redirect}, se esperaba ${check.status}`, retry: true };
  }
  for (const [name, expected] of Object.entries(check.responseHeaders ?? {})) {
    const value = response.headers.get(name);
    if (!value?.includes(expected)) {
      return { ok: false, detail: `la cabecera ${name} es ${JSON.stringify(value)}, debería incluir ${JSON.stringify(expected)}`, retry: true };
    }
  }
  if (check.contains) {
    const body = await response.text();
    if (!body.includes(check.contains)) {
      return { ok: false, detail: `la respuesta no contiene ${JSON.stringify(check.contains)}`, retry: true };
    }
  }
  return { ok: true };
}

/**
 * Corre todos los chequeos (reintenta los fallos transitorios, p. ej. un arranque en frío) y
 * devuelve el código de salida: 0 si todos pasan.
 */
export async function runSmoke(
  baseUrl,
  {
    checks = CHECKS,
    fetch = globalThis.fetch,
    bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || undefined,
    attempts = 3,
    delayMs = 5_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = console.log,
    error = console.error,
  } = {},
) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    error(`✗ URL inválida: ${JSON.stringify(baseUrl ?? "")}\n  Uso: node scripts/smoke.mjs https://<dominio>`);
    return 2;
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    error(`✗ Usa https (o localhost): ${url.href}`);
    return 2;
  }

  log(`Smoke tests contra ${url.origin}`);
  let failures = 0;
  for (const check of checks) {
    let result;
    for (let attempt = 1; ; attempt++) {
      result = await runCheck(url, check, { fetch, bypassSecret });
      if (result.ok || !result.retry || attempt >= attempts) break;
      await sleep(delayMs);
    }
    if (result.ok) log(`  ✓ ${check.name}`);
    else {
      failures++;
      error(`  ✗ ${check.name}: ${result.detail}`);
    }
  }

  if (failures > 0) {
    error(`\n✗ ${failures} de ${checks.length} chequeos fallaron.`);
    return 1;
  }
  log(`\n✓ Los ${checks.length} chequeos pasaron.`);
  return 0;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Stryker disable next-line all
  process.exit(await runSmoke(process.argv[2]));
}
