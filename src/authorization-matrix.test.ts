import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { NextRequest } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

// Matriz de autorización: inventario de TODAS las entradas de la app (páginas, rutas de API y
// Server Actions) con la protección que debe tener cada una. Si agregas una entrada, esta prueba
// falla hasta que la clasifiques aquí; el aislamiento entre usuarios de cada una se prueba en
// integración (*.int.test.ts), con dos usuarios.

const ROOT = resolve(__dirname, "..");
const APP = join(ROOT, "src/app");

// ── Inventario esperado ───────────────────────────────────────────────────────────────────────

const PAGES = {
  "/": "pública (con sesión redirige al dashboard)",
  "/login": "pública (con sesión redirige al dashboard)",
  "/registro": "pública (con sesión redirige al dashboard)",
  "/privacidad": "pública siempre (la exige Meta)",
  "/eliminar-datos": "pública siempre (la exige Meta)",
  "/dashboard": "requiere sesión",
  "/ingresos": "requiere sesión",
  "/egresos": "requiere sesión",
  "/simulador": "requiere sesión; solo en desarrollo",
  "/movimientos/[id]/editar": "requiere sesión; solo movimientos propios (los demás dan 404)",
} as const;

const API_ROUTES = {
  "/api/auth/[...all] GET": "Better Auth: cada endpoint valida la sesión que necesita",
  "/api/auth/[...all] POST": "Better Auth: cada endpoint valida la sesión que necesita",
  "/api/whatsapp/webhook GET": "token de verificación de Meta",
  "/api/whatsapp/webhook POST": "firma HMAC de Meta (X-Hub-Signature-256)",
  "/api/health GET": "pública: no devuelve datos ni detalles de configuración",
} as const;

const SERVER_ACTIONS = {
  createTransactionAction: "requireUser; el dueño sale de la sesión, nunca del formulario",
  updateTransactionAction: "requireUser; solo edita movimientos propios, sin cambiar su tipo",
  deleteTransactionAction: "requireUser; solo borra movimientos propios",
  generateLinkCodeAction: "requireUser; el código queda a nombre del usuario de la sesión",
  unlinkWhatsAppAction: "requireUser; solo desvincula el número propio",
  simulateMessageAction: "solo en desarrollo + requireUser",
  signOutAction: "sin sesión no hay nada que cerrar",
} as const;

// Acciones que no necesitan validar la sesión, con el porqué.
const ACTIONS_WITHOUT_SESSION = ["signOutAction"];

// ── Lectura del código ────────────────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(join(ROOT, "src")).filter(
  (f) => /\.tsx?$/.test(f) && !/\.(int\.)?test\.tsx?$/.test(f),
);
const read = (file: string) => readFileSync(file, "utf8");

/** Ruta pública de un archivo de src/app, sin los grupos "(...)". */
const routeOf = (file: string) =>
  "/" +
  relative(APP, dirname(file))
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .join("/");

const pageFiles = sourceFiles.filter((f) => f.startsWith(APP) && f.endsWith("/page.tsx"));
const routeFiles = sourceFiles.filter((f) => f.startsWith(APP) && f.endsWith("/route.ts"));

/** Métodos HTTP que exporta un route handler. */
function exportedMethods(source: string) {
  const methods = /GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS/;
  const fromFunctions = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
  const fromConst = [...source.matchAll(/export\s+const\s+\{([^}]+)\}/g)].flatMap((m) =>
    m[1].split(",").map((s) => s.trim()),
  );
  return [...fromFunctions, ...fromConst].filter((name) => methods.test(name));
}

/** Server Actions: funciones exportadas de archivos "use server" y funciones con "use server". */
function serverActions() {
  const actions: Array<{ name: string; file: string; body: string }> = [];
  for (const file of sourceFiles) {
    const source = read(file);
    if (/^\s*["']use server["']/.test(source)) {
      const parts = source.split(/(?=^export\s+async\s+function\s)/m).slice(1);
      for (const body of parts) {
        const name = body.match(/^export\s+async\s+function\s+(\w+)/)?.[1];
        if (name) actions.push({ name, file, body });
      }
    }
    for (const m of source.matchAll(/async\s+function\s+(\w+)\s*\([^)]*\)\s*\{\s*["']use server["']/g)) {
      actions.push({ name: m[1], file, body: source.slice(m.index) });
    }
  }
  return actions;
}

/** ¿El archivo, o lo que importa con rutas relativas o "@/", llama a requireUser()? */
function reachesRequireUser(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const source = read(file);
  if (/\brequireUser\(\)/.test(source)) return true;
  for (const [, spec] of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g)) {
    const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : resolve(dirname(file), spec);
    const target = [`${base}.tsx`, `${base}.ts`, join(base, "index.ts")].find((c) => sourceFiles.includes(c));
    if (target && reachesRequireUser(target, seen)) return true;
  }
  return false;
}

// ── Pruebas ───────────────────────────────────────────────────────────────────────────────────

describe("inventario", () => {
  it("toda página está clasificada", () => {
    expect(pageFiles.map(routeOf).sort()).toEqual(Object.keys(PAGES).sort());
  });

  it("toda ruta de API y cada uno de sus métodos está clasificada", () => {
    const found = routeFiles.flatMap((file) =>
      exportedMethods(read(file)).map((method) => `${routeOf(file)} ${method}`),
    );
    expect(found.sort()).toEqual(Object.keys(API_ROUTES).sort());
  });

  it("toda Server Action está clasificada", () => {
    expect(serverActions().map((a) => a.name).sort()).toEqual(Object.keys(SERVER_ACTIONS).sort());
  });
});

describe("páginas", () => {
  const privatePages = Object.entries(PAGES)
    .filter(([, rule]) => rule.startsWith("requiere sesión"))
    .map(([path]) => path);
  const publicPages = Object.keys(PAGES).filter((p) => !privatePages.includes(p));

  const visitWithoutSession = (path: string) =>
    getRedirectUrl(proxy(new NextRequest(`https://finanzas.test${path}`))) ?? "sigue";

  it("sin sesión, el proxy manda las privadas al login y deja ver las públicas", () => {
    for (const path of privatePages) expect(visitWithoutSession(path), path).toBe("https://finanzas.test/login");
    for (const path of publicPages) expect(visitWithoutSession(path), path).toBe("sigue");
  });

  it("las privadas validan la sesión en el servidor (requireUser), no solo en el proxy", () => {
    for (const file of pageFiles.filter((f) => privatePages.includes(routeOf(f)))) {
      expect(reachesRequireUser(file), routeOf(file)).toBe(true);
    }
  });
});

describe("Server Actions", () => {
  it("validan la sesión con requireUser() antes de hacer cualquier cosa", () => {
    for (const action of serverActions().filter((a) => !ACTIONS_WITHOUT_SESSION.includes(a.name))) {
      const body = action.body;
      const check = body.search(/await\s+requireUser\(\)/);
      expect(check, `${action.name} no llama a requireUser()`).toBeGreaterThan(-1);
      // Nada toca la base ni el bot antes de validar la sesión.
      const firstDataAccess = body.search(/\bdb\.|createLinkCode\(|unlinkUser\(|handleIncomingMessage\(|isCategoryAvailable\(|readForm\(/);
      expect(firstDataAccess === -1 || check < firstDataAccess, `${action.name} usa datos antes de validar la sesión`).toBe(true);
    }
  });

  it("nunca toman el dueño de los datos del formulario o de los argumentos", () => {
    for (const action of serverActions()) {
      expect(action.body, action.name).not.toMatch(/formData\.get\(["']userId["']\)|userId:\s*(formData|args|input)\./);
    }
  });

  it("el simulador se bloquea en producción antes de validar la sesión", () => {
    const simulate = serverActions().find((a) => a.name === "simulateMessageAction")!;
    expect(simulate.body.indexOf('process.env.NODE_ENV === "production"')).toBeLessThan(
      simulate.body.indexOf("requireUser()"),
    );
  });
});

describe("acceso a datos desde src/app", () => {
  it("todo archivo de src/app que lee datos de usuarios valida la sesión (salvo las rutas de API)", () => {
    const dataModules = /from\s+["']@\/(db|modules\/transactions\/queries|modules\/whatsapp\/link)["']/;
    const offenders = sourceFiles
      .filter((f) => f.startsWith(APP) && !f.includes("/api/"))
      .filter((f) => dataModules.test(read(f)))
      .filter((f) => !/\brequireUser\(\)/.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
