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
  "/cuenta-eliminada": "pública siempre (se llega justo después de eliminar la cuenta)",
  "/cuenta": "requiere sesión",
  "/ayuda": "requiere sesión; solo textos de ayuda (no lee datos de la persona)",
  "/dashboard": "requiere sesión",
  "/ingresos": "requiere sesión",
  "/egresos": "requiere sesión",
  "/gastos-fijos": "requiere sesión; solo los gastos fijos propios (sus marcas y notas, también)",
  "/reportes": "requiere sesión; solo los movimientos propios",
  "/simulador": "requiere sesión; solo en desarrollo",
  "/movimientos/[id]/editar": "requiere sesión; solo movimientos propios (los demás dan 404)",
  "/admin": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin); Inicio de la administración",
  "/admin/historial": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin)",
  "/admin/usuarios": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin)",
  "/admin/usuarios/[id]": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin); un id inválido o inexistente da 404",
  "/admin/categorias": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin)",
  "/admin/bot": "requiere sesión de admin con la verificación en dos pasos activa (requireAdmin); sin el texto de los mensajes",
  "/admin/seguridad": "requiere sesión de admin; es donde se configura la verificación en dos pasos (requireAdminRole)",
} as const;

const API_ROUTES = {
  "/api/auth/[...all] GET":
    "Better Auth: solo atiende AUTH_HTTP_ROUTES (src/modules/auth/http-routes.ts; ninguna es GET) y cada una valida la sesión que necesita",
  "/api/auth/[...all] POST":
    "Better Auth: solo atiende AUTH_HTTP_ROUTES (src/modules/auth/http-routes.ts) y cada una valida la sesión que necesita",
  "/api/whatsapp/webhook GET": "token de verificación de Meta",
  "/api/whatsapp/webhook POST": "firma HMAC de Meta (X-Hub-Signature-256)",
  "/api/health GET": "pública: no devuelve datos ni detalles de configuración",
  "/api/cron/limpieza GET": "solo Vercel Cron, con el secreto CRON_SECRET (src/lib/cron-auth.ts); devuelve solo cantidades",
  "/reportes/exportar GET": "requiere sesión (requireUser); solo los movimientos propios del período, sin los eliminados",
  "/reportes/pdf GET": "requiere sesión (requireUser); solo los datos propios del período, sin los movimientos eliminados",
} as const;

const SERVER_ACTIONS = {
  createTransactionAction: "requireUser; el dueño sale de la sesión, nunca del formulario",
  updateTransactionAction: "requireUser; solo edita movimientos propios, sin cambiar su tipo",
  deleteTransactionAction: "requireUser; solo borra movimientos propios",
  restoreTransactionAction: "requireUser; solo restaura movimientos propios, borrados hace menos de 10 minutos",
  generateLinkCodeAction: "requireUser; el código queda a nombre del usuario de la sesión",
  unlinkWhatsAppAction: "requireUser; solo desvincula el número propio",
  simulateMessageAction: "solo en desarrollo + requireUser",
  signOutAction: "sin sesión no hay nada que cerrar",
  deleteAccountAction: "requireUser + contraseña + palabra de confirmación; solo la cuenta propia",
  changePasswordAction:
    "requireUser + contraseña actual (con el bloqueo por intentos) + código de Google Authenticator si es admin; solo la cuenta propia; cierra las otras sesiones",
  finishTwoFactorSetupAction: "requireAdmin (con la verificación ya activa); cierra las demás sesiones propias",
  unlockLoginAction: "requireAdmin + código de Google Authenticator; nunca la cuenta propia ni la de otro admin",
  revokeSessionsAction: "requireAdmin + código de Google Authenticator; nunca la cuenta propia ni la de otro admin",
  unlinkWhatsAppByAdminAction: "requireAdmin + código de Google Authenticator; nunca la cuenta propia ni la de otro admin",
  suspendAccountAction: "requireAdmin + código de Google Authenticator; nunca la cuenta propia ni la de otro admin",
  reactivateAccountAction: "requireAdmin + código de Google Authenticator; nunca la cuenta propia ni la de otro admin",
  createCategoryAction: "requireAdmin; solo categorías globales, sin repetir nombres",
  updateCategoryAction: "requireAdmin; solo categorías globales; a \"Otros\" solo el emoji",
  restoreCategoryAction: "requireAdmin; solo deshace un archivado",
  archiveCategoryAction: "requireAdmin + código de Google Authenticator; \"Otros\" no se archiva",
  deleteCategoryAction: "requireAdmin + código de Google Authenticator; sus movimientos pasan a \"Otros\", que no se elimina",
  deleteAccountByAdminAction:
    "requireAdmin + código de Google Authenticator + escribir el correo; nunca la cuenta propia ni la de otro admin",
  grantAdminAction:
    "requireSuperAdmin + código de Google Authenticator; nunca la cuenta propia, la de un admin ni una suspendida; cierra sus sesiones",
  revokeAdminAction:
    "requireSuperAdmin + código de Google Authenticator; solo a otro admin, nunca al super admin; borra su verificación y cierra sus sesiones",
  pauseClaudeAction: "requireAdmin + código de Google Authenticator; solo la configuración global del bot",
  resumeClaudeAction: "requireAdmin + código de Google Authenticator; solo la configuración global del bot",
  changeAiLimitsAction: "requireAdmin + código de Google Authenticator; topes dentro de AI_LIMIT_BOUNDS",
  testConnectionsAction: "requireAdmin; solo lee (consultas gratis a WhatsApp y Claude): nunca muestra el token ni la API key",
  changeMonthlyLimitAction: "requireAdmin + código de Google Authenticator; tope dentro de MONTHLY_TOKEN_BOUNDS o sin tope",
  resendRepliesAction: "requireAdmin + código de Google Authenticator; solo las respuestas que no salieron en 24 h, sin mostrarlas",
  chooseFixedExpenseAction:
    "requireUser; solo los gastos fijos propios (el dueño sale de la sesión); agregar exige un egreso propio con esa descripción",
  saveFixedNoteAction:
    "requireUser; solo notas propias, de un gasto que la persona pagó ese mes; hasta 280 caracteres",
  skipFixedPaymentAction:
    "requireUser; solo marca 'ya no aplica' el pago de un mes de un gasto propio (un egreso propio con esa descripción)",
  saveUpcomingSettingsAction: "requireUser; solo la configuración propia de los avisos; días de 0 a 10",
  markNotificationsReadAction: "requireUser; solo marca como leídas notificaciones propias (ids con su formato, hasta 50)",
  registerFixedPaymentAction:
    "requireUser; registra un egreso propio con la descripción y la categoría del último pago propio de ese gasto (las busca el servidor); fecha hasta hoy",
} as const;

// Acciones que no necesitan validar la sesión, con el porqué.
const ACTIONS_WITHOUT_SESSION = ["signOutAction"];

// Páginas privadas que no validan la sesión ellas mismas, con el porqué.
const PAGES_WITHOUT_SESSION_CHECK: Record<string, string> = {
  "/simulador": "solo en desarrollo y no muestra datos: cada mensaje valida la sesión en simulateMessageAction",
};

// Administración: páginas cuya regla empieza con ADMIN_RULE y acciones cuya regla empieza con
// "requireAdmin". Deben validar el rol en el servidor con requireAdmin() (src/lib/session.ts). Las de
// dar y quitar el rol de admin empiezan con "requireSuperAdmin": requireSuperAdmin() (que incluye
// requireAdmin), y solo se usa en SUPER_ADMIN_FILES.
const ADMIN_RULE = "requiere sesión de admin";
// La capa de datos de administración: los archivos de src/modules/admin/ que consultan la base.
const ADMIN_MODULES_DIR = join(ROOT, "src/modules/admin");
// Las consultas de los comandos de terminal: no validan sesión, nunca se usan desde la app.
const TERMINAL_MODULE = /from\s+["'](@\/modules\/account\/terminal|[./]+(modules\/account\/)?terminal)["']/;
// requireAdminRole no exige la verificación en dos pasos: solo lo usan la página donde se configura
// y el marco de la sección (que solo dibuja el título y la subnavegación). Todo lo demás de
// administración usa requireAdmin.
const ADMIN_ROLE_ONLY_FILES = ["src/app/(app)/admin/layout.tsx", "src/app/(app)/admin/seguridad/page.tsx"];
// Donde se usa requireSuperAdmin (además de session.ts, donde se define): la capa de datos de las
// acciones sobre una cuenta y sus Server Actions.
const SUPER_ADMIN_FILES = [
  "src/app/(app)/admin/usuarios/[id]/actions.ts",
  "src/modules/admin/users/account-actions.ts",
];
// Los únicos archivos que comparan roles; el resto usa requireAdmin() o hasRole().
const ROLE_CHECK_FILES = ["src/lib/roles.ts", "src/lib/session.ts"];

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
  // export const GET = …
  const fromAssignment = [...source.matchAll(/export\s+const\s+(\w+)\s*=/g)].map((m) => m[1]);
  return [...fromFunctions, ...fromConst, ...fromAssignment].filter((name) => methods.test(name));
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

const SESSION_MODULE = join(ROOT, "src/lib/session.ts");

/** Una llamada a fn() (no su definición: "function fn()" no cuenta). */
const callsTo = (fn: string) => new RegExp(`(?<!function\\s+)\\b${fn}\\(\\)`);

const isServerActionsFile = (source: string) => /^\s*["']use server["']/.test(source);

/**
 * ¿El archivo, o lo que importa con rutas relativas o "@/", llama a alguna de esas funciones?
 * No cuenta lo que no protege al archivo que importa:
 *  - src/lib/session.ts, donde se definen (y requireAdmin llama a requireUser);
 *  - los archivos de Server Actions: cada acción valida su propia llamada, no la página que la usa.
 */
function reachesCall(file: string, fns: string[], seen = new Set<string>()): boolean {
  if (seen.has(file) || file === SESSION_MODULE) return false;
  seen.add(file);
  const source = read(file);
  if (seen.size > 1 && isServerActionsFile(source)) return false;
  if (fns.some((fn) => callsTo(fn).test(source))) return true;
  for (const [, spec] of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g)) {
    const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : resolve(dirname(file), spec);
    const target = [`${base}.tsx`, `${base}.ts`, join(base, "index.ts")].find((c) => sourceFiles.includes(c));
    if (target && reachesCall(target, fns, seen)) return true;
  }
  return false;
}

// requireAdmin y requireAdminRole también validan la sesión (llaman a requireUser).
const reachesRequireUser = (file: string) => reachesCall(file, ["requireUser", "requireAdmin", "requireAdminRole"]);

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
    const checked = pageFiles.filter((f) => privatePages.includes(routeOf(f)) && !(routeOf(f) in PAGES_WITHOUT_SESSION_CHECK));
    expect(checked.length).toBeGreaterThan(0);
    for (const file of checked) {
      expect(reachesRequireUser(file), routeOf(file)).toBe(true);
    }
  });

  it("las rutas que requieren sesión la validan en el servidor (requireUser), y el proxy las manda al login", () => {
    const withSession = Object.entries(API_ROUTES)
      .filter(([, rule]) => rule.startsWith("requiere sesión"))
      .map(([key]) => key.split(" ")[0]);
    expect(withSession.length).toBeGreaterThan(0);
    for (const route of withSession) {
      const file = routeFiles.find((f) => routeOf(f) === route);
      expect(file, route).toBeDefined();
      expect(reachesRequireUser(file!), route).toBe(true);
      expect(visitWithoutSession(route), route).toBe("https://finanzas.test/login");
    }
  });

  it("las excepciones son páginas privadas que existen", () => {
    for (const path of Object.keys(PAGES_WITHOUT_SESSION_CHECK)) expect(privatePages, path).toContain(path);
  });
});

describe("administración", () => {
  const adminPages = Object.entries(PAGES)
    .filter(([, rule]) => (rule as string).startsWith(ADMIN_RULE))
    .map(([path]) => path);
  const adminActions = Object.entries(SERVER_ACTIONS)
    .filter(([, rule]) => (rule as string).startsWith("requireAdmin"))
    .map(([name]) => name);
  const superAdminActions = Object.entries(SERVER_ACTIONS)
    .filter(([, rule]) => (rule as string).startsWith("requireSuperAdmin"))
    .map(([name]) => name);

  it("toda página bajo /admin está clasificada como de admin", () => {
    for (const file of pageFiles.filter((f) => /^\/admin(\/|$)/.test(routeOf(f)))) {
      expect(adminPages, routeOf(file)).toContain(routeOf(file));
    }
  });

  it("las páginas de admin validan el rol en el servidor (requireAdmin)", () => {
    const checked = pageFiles.filter((f) => adminPages.includes(routeOf(f)));
    expect(checked.length).toBeGreaterThan(0);
    for (const file of checked) {
      const allowed = ADMIN_ROLE_ONLY_FILES.includes(relative(ROOT, file)) ? ["requireAdminRole"] : ["requireAdmin"];
      expect(reachesCall(file, allowed), routeOf(file)).toBe(true);
    }
  });

  it("requireAdminRole (sin la verificación en dos pasos) solo se usa donde se configura y en el marco", () => {
    const users = sourceFiles
      .filter((f) => relative(ROOT, f) !== "src/lib/session.ts")
      .filter((f) => callsTo("requireAdminRole").test(read(f)) || /\brequireAdminRole\b/.test(read(f)))
      .map((f) => relative(ROOT, f))
      .sort();
    expect(users).toEqual(ADMIN_ROLE_ONLY_FILES);
  });

  it("el marco de la sección valida el rol antes de dibujarse (a quien no es admin no le llega nada)", () => {
    const layout = read(join(APP, "(app)/admin/layout.tsx"));
    expect(layout).toMatch(callsTo("requireAdminRole"));
  });

  it("las de dar y quitar el rol de admin llaman a requireSuperAdmin() antes de hacer cualquier cosa", () => {
    expect(superAdminActions).toEqual(["grantAdminAction", "revokeAdminAction"]);
    for (const action of serverActions().filter((a) => superAdminActions.includes(a.name))) {
      const check = action.body.search(/await\s+requireSuperAdmin\(\)/);
      expect(check, `${action.name} no llama a requireSuperAdmin()`).toBeGreaterThan(-1);
      const firstDataAccess = action.body.search(/\bdb\.|readInput\(|grantAdmin\(|revokeAdmin\(/);
      expect(firstDataAccess === -1 || check < firstDataAccess, `${action.name} usa datos antes de validar el rol`).toBe(true);
    }
  });

  it("requireSuperAdmin solo se usa en las acciones de dar y quitar el rol de admin", () => {
    const users = sourceFiles
      .filter((f) => relative(ROOT, f) !== "src/lib/session.ts")
      .filter((f) => /\brequireSuperAdmin\b/.test(read(f)))
      .map((f) => relative(ROOT, f))
      .sort();
    expect(users).toEqual([...SUPER_ADMIN_FILES].sort());
    // En la capa de datos, solo las dos funciones de los roles.
    const source = read(join(ROOT, "src/modules/admin/users/account-actions.ts"));
    const withSuper = source
      .split(/(?=^export\s+async\s+function\s)/m)
      .filter((part) => /await\s+requireSuperAdmin\(\)/.test(part))
      .map((part) => part.match(/^export\s+async\s+function\s+(\w+)/)?.[1]);
    expect(withSuper).toEqual(["grantAdmin", "revokeAdmin"]);
  });

  it("las Server Actions de admin llaman a requireAdmin() antes de hacer cualquier cosa", () => {
    for (const action of serverActions().filter((a) => adminActions.includes(a.name))) {
      const check = action.body.search(/await\s+requireAdmin\(\)/);
      expect(check, `${action.name} no llama a requireAdmin()`).toBeGreaterThan(-1);
      const firstDataAccess = action.body.search(/\bdb\.|readForm\(|from\(|setRole\(/);
      expect(firstDataAccess === -1 || check < firstDataAccess, `${action.name} usa datos antes de validar el rol`).toBe(true);
    }
  });

  // Capa de datos: cada función exportada de un archivo de src/modules/admin/ que consulta la base
  // valida el rol ella misma, antes de tocar la base. Así ninguna página puede mostrar esos datos
  // aunque olvide validar (y las páginas validan también: la regla de arriba).
  const adminDataFiles = sourceFiles.filter(
    (f) => f.startsWith(ADMIN_MODULES_DIR) && /from\s+["']@\/db["']/.test(read(f)),
  );

  it("la capa de datos de administración existe y la regla la encuentra", () => {
    expect(adminDataFiles.map((f) => relative(ROOT, f))).toEqual(
      expect.arrayContaining([
        "src/modules/admin/history/events-log.ts",
        "src/modules/admin/users/users.ts",
        "src/modules/admin/users/account-actions.ts",
        "src/modules/admin/shared/confirm-code.ts",
        "src/modules/admin/categories/categories.ts",
        "src/modules/admin/bot/bot-activity.ts",
        "src/modules/admin/bot/bot-settings.ts",
        "src/modules/admin/bot/connections.ts",
        "src/modules/admin/bot/resend.ts",
      ]),
    );
  });

  it("cada consulta de administración llama a requireAdmin() antes de tocar la base", () => {
    for (const file of adminDataFiles) {
      const parts = read(file).split(/(?=^export\s+async\s+function\s)/m).slice(1);
      expect(parts.length, relative(ROOT, file)).toBeGreaterThan(0);
      for (const body of parts) {
        const name = body.match(/^export\s+async\s+function\s+(\w+)/)?.[1];
        // requireSuperAdmin incluye requireAdmin (solo dar y quitar el rol de admin).
        const check = body.search(/await\s+require(Super)?Admin\(\)/);
        expect(check, `${name} (${relative(ROOT, file)}) no llama a requireAdmin()`).toBeGreaterThan(-1);
        const firstDataAccess = body.search(/\bdb\.|\bwhere\(/);
        expect(firstDataAccess === -1 || check < firstDataAccess, `${name} toca la base antes de validar el rol`).toBe(true);
      }
      // Nada de exportar consultas como constantes o funciones sin async (se saltarían la regla).
      expect(read(file), relative(ROOT, file)).not.toMatch(/^export\s+(const|let|function)\s/m);
    }
  });

  it("las consultas de los comandos de terminal no se usan desde la app", () => {
    const offenders = sourceFiles
      .filter((f) => !f.endsWith("src/modules/account/terminal.ts"))
      .filter((f) => TERMINAL_MODULE.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("solo src/lib/roles.ts y session.ts comparan roles (el resto usa requireAdmin o hasRole)", () => {
    const offenders = sourceFiles
      .filter((f) => !ROLE_CHECK_FILES.includes(relative(ROOT, f)))
      .filter((f) => /\brole\s*[!=]==?\s*["'`]|["'`](admin|user)["`']\s*[!=]==?\s*\w*\.?role\b/.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("requireAdmin, requireAdminRole y requireSuperAdmin solo se definen en src/lib/session.ts", () => {
    const definitions = sourceFiles
      .filter((f) => /function\s+require(Super)?Admin(Role)?\b|require(Super)?Admin(Role)?\s*=/.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(definitions).toEqual(["src/lib/session.ts"]);
  });
});

describe("Server Actions", () => {
  it("validan la sesión con requireUser() (o requireAdmin()) antes de hacer cualquier cosa", () => {
    for (const action of serverActions().filter((a) => !ACTIONS_WITHOUT_SESSION.includes(a.name))) {
      const body = action.body;
      const check = body.search(/await\s+require(User|Admin|SuperAdmin)\(\)/);
      expect(check, `${action.name} no llama a requireUser()`).toBeGreaterThan(-1);
      // Nada toca la base ni el bot antes de validar la sesión.
      const firstDataAccess = body.search(/\bdb\.|createLinkCode\(|unlinkUser\(|handleIncomingMessage\(|isCategoryAvailable\(|readForm\(|verifyPassword\(|deleteAccountData\(/);
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
