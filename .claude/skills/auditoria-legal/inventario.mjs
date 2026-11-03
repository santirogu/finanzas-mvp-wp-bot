#!/usr/bin/env node
// Inventario automático de la auditoría legal (SKILL.md, paso 2): compara lo que la app guarda y con quién lo
// comparte con lo que dice /privacidad, y lo que exige la norma por escrito. Solo lee archivos (y git); no cambia
// nada ni consulta la base.
//
// Uso (desde la raíz del repo):
//   node .claude/skills/auditoria-legal/inventario.mjs              todo
//   node .claude/skills/auditoria-legal/inventario.mjs cambios      solo lo que cambió frente a origin/main
//
// Una línea no es todavía un hallazgo: se verifica con su norma (SKILL.md, paso 4). Si la app agrega una tabla, un
// servicio externo o un plazo de borrado, clasifícalo aquí en el mismo PR (TABLES, SERVICES).

import { execFileSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const mode = process.argv[2] === "cambios" ? "cambios" : "completa";
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const glob = (pattern) => globSync(pattern, { cwd: ROOT }).sort();
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const isTest = (file) => /\.(test|int\.test|spec)\.tsx?$/.test(file);

const changed =
  mode === "cambios"
    ? new Set([...git("diff", "--name-only", "origin/main...HEAD"), ...git("diff", "--name-only"), ...git("ls-files", "--others", "--exclude-standard")])
    : null;
const inScope = (file) => !changed || changed.has(file);
/** En el modo cambios, una sección que mira estos archivos solo sale si alguno cambió. */
const touched = (...files) => !changed || files.some((file) => changed.has(file));

// Lo que dice la política: /privacidad, sus pasos compartidos y el responsable, como texto (sin etiquetas).
const POLICY_FILES = ["src/app/[lang]/privacidad/page.tsx", "src/app/[lang]/privacidad/legal.tsx", "src/lib/contact.ts"];
const policy = POLICY_FILES.map(read)
  .join("\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/\{" "\}/g, " ")
  .replace(/\s+/g, " ");

/**
 * Cada tabla y lo que la nombra en /privacidad. `null`, sin datos de una persona (con su porqué). Una tabla nueva
 * sin entrada sale en "Tablas sin clasificar".
 */
const TABLES = {
  user: /Datos de la cuenta/,
  account: /contraseña \(guardada/,
  session: /Datos técnicos de la sesión/,
  verification: null, // tokens temporales de Better Auth; la app no verifica correos ni recupera contraseñas
  rate_limit: /dirección IP/, // la IP por unos segundos, para el límite de intentos
  login_failure: /intentos fallidos/,
  two_factor: null, // el secreto de Google Authenticator: solo cuentas de admin (quienes operan la app)
  admin_code_use: null, // el último código del admin, contra la reutilización
  category_change: null, // lo que hizo un admin con las categorías globales
  app_setting: null,
  signup_invite: /Si te invitamos a crear una cuenta/,
  app_notice: null,
  app_values: null,
  whatsapp_link: /Datos de WhatsApp/,
  whatsapp_link_code: /Datos de WhatsApp/,
  whatsapp_message: /mensajes que envías al bot/,
  bot_setting: null,
  category: /categorías/,
  transaction: /Información financiera que registras/,
  category_budget: /Tus presupuestos/,
  fixed_expense_choice: /gastos fijos marcados a mano/,
  fixed_expense_note: /notas del historial de los gastos fijos/,
  fixed_payment_skip: /Los pagos que ya no aplican/,
  fixed_payment_link: /Registrar pago/,
  notification_setting: /configuración de las notificaciones/,
  reminder_setting: /recordatorio de registro/,
  notification_read: /notificaciones que marcas como leídas/,
  account_event: /Historial de tu cuenta/,
  cron_run: null,
};

/** Los servicios externos y lo que los nombra en /privacidad; `null`, los que no reciben datos de las personas. */
const SERVICES = {
  "api.anthropic.com": /Anthropic/,
  "graph.facebook.com": /Meta \(WhatsApp/,
  "wa.me": null, // un enlace para abrir WhatsApp; la app no le manda nada
  "va.vercel-scripts.com": /Vercel Web Analytics/,
  "api.github.com": null, // el admin ve el estado del CI y de las releases (Salud): sin datos de las personas
  "github.com": null,
  "platform.claude.com": null, // un enlace de la página del admin
  "www.sic.gov.co": null, // un enlace de la política
};
// Las dependencias que hablan con un servicio externo desde la app.
const SDKS = { "@anthropic-ai/sdk": /Anthropic/, "@vercel/analytics": /Vercel Web Analytics/, "@vercel/speed-insights": /Vercel Speed Insights/ };

const sections = [];
function section(title, what, run) {
  try {
    sections.push({ title, what, lines: run() });
  } catch (error) {
    sections.push({ title, what, lines: [`(no se pudo revisar: ${error.message})`] });
  }
}

const schemaFiles = glob("src/db/schema/*.ts").filter((file) => !isTest(file));
const tables = schemaFiles.flatMap((file) => [...read(file).matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map(([, name]) => ({ name, file })));

section(
  "Tablas sin clasificar",
  "Tablas de src/db/schema que este inventario no conoce: ¿guardan datos de una persona? Clasifícalas en TABLES y, si los guardan, nómbralas en /privacidad.",
  () => tables.filter(({ name, file }) => inScope(file) && !(name in TABLES)).map(({ name, file }) => `${name} (${file})`),
);

section(
  "Datos de las personas que /privacidad no nombra",
  "Tablas con datos de una persona cuya mención no aparece en la política (Ley 1581, art. 12; Decreto 1377, art. 13): o falta en la política, o cambió el texto y hay que ajustar TABLES.",
  () =>
    tables
      .filter(({ name, file }) => inScope(file) && TABLES[name] && !TABLES[name].test(policy))
      .map(({ name, file }) => `${name} (${file}) — se esperaba ${TABLES[name]}`),
);

section(
  "Columnas de la cuenta",
  "Las columnas de `user`: cada dato de la persona que guarda la cuenta. Revisa que la política diga los que no son técnicos.",
  () => {
    if (!touched("src/db/schema/auth.ts")) return [];
    const source = read("src/db/schema/auth.ts");
    const block = source.slice(source.indexOf('pgTable(\n  "user"') >= 0 ? source.indexOf('pgTable(\n  "user"') : source.indexOf('"user"'));
    const body = block.slice(0, block.indexOf("\n  },"));
    return [...body.matchAll(/^\s{4}(\w+): \w+\("([a-z_]+)"/gm)].map(([, , column]) => column);
  },
);

section(
  "Servicios externos",
  "Dominios a los que el código de la app llama o enlaza, y dependencias que hablan con un servicio. Cada uno que recibe datos de las personas va en 'Con quién compartimos datos' (Ley 1581, art. 26; Decreto 1377, arts. 24 y 25).",
  () => {
    const sources = glob("src/**/*.{ts,tsx}").filter((file) => !isTest(file) && inScope(file));
    const hosts = new Map();
    for (const file of sources) {
      for (const [, host] of read(file).matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)) {
        if (/(^|\.)(localhost|example\.(com|org)|test)$/.test(host) || host.endsWith(".local")) continue;
        if (!hosts.has(host)) hosts.set(host, file);
      }
    }
    const lines = [...hosts].map(([host, file]) => {
      if (!(host in SERVICES)) return `${host} (${file}): sin clasificar en SERVICES`;
      const rule = SERVICES[host];
      if (rule === null) return null;
      return rule.test(policy) ? null : `${host} (${file}): la política no lo nombra (se esperaba ${rule})`;
    });
    const deps = Object.keys(JSON.parse(read("package.json")).dependencies ?? {});
    for (const [sdk, rule] of Object.entries(SDKS)) {
      if (deps.includes(sdk) && !rule.test(policy)) lines.push(`${sdk}: la política no lo nombra (se esperaba ${rule})`);
    }
    return lines.filter(Boolean);
  },
);

section(
  "Retención",
  "Lo que borra la limpieza diaria (RETENTION_DAYS) y lo que promete la política. Deben decir lo mismo (Decreto 1377, art. 11; CLAUDE.md → Retención).",
  () => {
    if (!touched("src/modules/account/retention.ts", ...POLICY_FILES)) return [];
    const retention = read("src/modules/account/retention.ts");
    const code = [...retention.matchAll(/^\s+(\w+): (\d+),/gm)].map(([, key, days]) => `código: ${key} → ${days} días`);
    const promised = [...policy.matchAll(/([^.;:]{0,80}a los (\d+) días)/g)].map(([, text]) => `política: «…${text.trim()}»`);
    const codeDays = new Set([...retention.matchAll(/^\s+\w+: (\d+),/gm)].map(([, days]) => days));
    const mismatches = [...policy.matchAll(/a los (\d+) días/g)].filter(([, days]) => !codeDays.has(days)).map(([, days]) => `la política promete ${days} días y el código no tiene ese plazo`);
    return [...code, ...promised, ...mismatches];
  },
);

section(
  "La política frente al Decreto 1377, art. 13",
  "El contenido mínimo de la política de tratamiento. Lo que falta aquí es casi siempre un hallazgo.",
  () => {
    if (!touched(...POLICY_FILES)) return [];
    const contact = read("src/lib/contact.ts");
    const checks = [
      ["Nombre del responsable", /DATA_CONTROLLER\.name/.test(read(POLICY_FILES[0])) && /name: "[^"]+"/.test(contact)],
      ["Domicilio", /domicilio en/.test(policy) && /city: "[^"]+"/.test(contact)],
      ["Dirección", /address: "[^"]+"/.test(contact) && /DATA_CONTROLLER\.address/.test(read(POLICY_FILES[0]))],
      ["Correo electrónico", /CONTACT_EMAIL = "[^"]+@/.test(contact)],
      ["Teléfono", /phone: "[^"]+"/.test(contact) && /DATA_CONTROLLER\.phone/.test(read(POLICY_FILES[0]))],
      ["Tratamiento y finalidad", /Para qué usamos tus datos/.test(policy)],
      ["Derechos del titular", /Tus derechos/.test(policy)],
      ["Quién atiende peticiones, consultas y reclamos", /consultas y reclamos/i.test(policy)],
      ["Procedimiento para ejercer los derechos", /Consultas y reclamos/.test(policy) && /días hábiles/.test(policy)],
      ["Fecha de entrada en vigencia de la política", /entrada en vigencia|vigente desde|rige desde/i.test(policy)],
      ["Período de vigencia de la base de datos", /vigencia de la base|período de vigencia|base de datos[^.]{0,40}estará\s+vigente/i.test(policy)],
    ];
    return checks.filter(([, ok]) => !ok).map(([what]) => `falta: ${what}`);
  },
);

section(
  "La autorización y su versión",
  "PRIVACY_VERSION (src/lib/privacy.ts) y lo que cambió desde la última vez que se subió: si cambió qué se guarda, para qué, con quién o por cuánto tiempo, hay que subirla en el mismo PR que /privacidad (CLAUDE.md → Autorización de los datos).",
  () => {
    const version = read("src/lib/privacy.ts").match(/PRIVACY_VERSION = "([^"]+)"/)?.[1] ?? "(no se encontró)";
    const [since] = git("log", "-1", "--format=%h", "-S", `PRIVACY_VERSION = "${version}"`, "--", "src/lib/privacy.ts");
    const watched = ["src/db/schema", "src/modules/account/retention.ts", "src/app/[lang]/privacidad", "package.json", "src/lib/security-headers.ts"];
    const after = since ? git("log", "--format=%h %ad %s", "--date=short", `${since}..HEAD`, "--", ...watched) : [];
    return [`PRIVACY_VERSION = ${version} (desde ${since ?? "?"})`, ...after.map((line) => `después: ${line}`)];
  },
);

console.log(`Inventario legal · modo ${mode}${changed ? ` (${changed.size} archivos cambiados frente a origin/main)` : ""}`);
console.log(`${tables.length} tablas, ${Object.values(TABLES).filter(Boolean).length} con datos de las personas.\n`);
for (const { title, what, lines } of sections) {
  console.log(`${title.toUpperCase()} (${lines.length})`);
  console.log(`  ${what}`);
  for (const line of lines.length ? lines : ["nada que revisar"]) console.log(`  - ${line}`);
  console.log("");
}
