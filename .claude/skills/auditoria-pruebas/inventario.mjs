#!/usr/bin/env node
// Inventario automático de la auditoría de pruebas (SKILL.md, paso 2): lo que se puede revisar sin
// criterio. Solo lee archivos (y git, en el modo cambios); no corre pruebas ni cambia nada.
//
// Uso (desde la raíz del repo):
//   node .claude/skills/auditoria-pruebas/inventario.mjs              todo el repo
//   node .claude/skills/auditoria-pruebas/inventario.mjs cambios      solo lo que cambió frente a origin/main
//
// Cada sección dice qué revisa. Una línea en una sección no es todavía un hallazgo: se verifica
// (SKILL.md, paso 5). Si una convención del proyecto cambia (dónde van las pruebas, cómo se llaman),
// actualiza este script en el mismo PR.

import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, matchesGlob, relative } from "node:path";

const ROOT = process.cwd();
const mode = process.argv[2] === "cambios" ? "cambios" : "completa";
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const glob = (pattern) => globSync(pattern, { cwd: ROOT }).sort();
const isTest = (file) => /\.(test|int\.test|spec)\.tsx?$/.test(file);

/** Los archivos que cambiaron frente a origin/main (también los nuevos sin commit): el alcance del modo cambios. */
function changedFiles() {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  return new Set([...git("diff", "--name-only", "origin/main...HEAD"), ...git("diff", "--name-only"), ...git("ls-files", "--others", "--exclude-standard")]);
}
const changed = mode === "cambios" ? changedFiles() : null;
const inScope = (file) => !changed || changed.has(file);

/** Los textos entre comillas de un arreglo `nombre: [ … ]` de un archivo de configuración. */
function stringArray(source, key) {
  const block = source.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
  return block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

const sections = [];
/** Una sección del informe: su título, qué revisa y sus líneas (vacía = "nada que revisar"). */
function section(title, what, run) {
  try {
    sections.push({ title, what, lines: run() });
  } catch (error) {
    sections.push({ title, what, lines: [`(no se pudo revisar: ${error.message})`] });
  }
}

// El código del proyecto: lo que la cobertura podría medir.
const sources = glob("src/**/*.{ts,tsx}").filter((file) => !isTest(file) && !file.endsWith(".d.ts"));
const tests = glob("{src,scripts,test,e2e}/**/*.{test,spec}.{ts,tsx}");
const vitestConfig = read("vitest.config.mts");
const coverageInclude = stringArray(vitestConfig, "include").filter((p) => !p.includes("*.test"));
const coverageExclude = stringArray(vitestConfig.slice(vitestConfig.indexOf("exclude:")), "exclude");
const measured = (file) => coverageInclude.some((p) => matchesGlob(file, p)) && !coverageExclude.some((p) => matchesGlob(file, p));

section(
  "Código que la cobertura no mide",
  "Componentes de cliente y otros archivos fuera de `coverage.include` (vitest.config.mts). Las páginas y layouts del servidor se prueban con las E2E: no se listan.",
  () =>
    sources
      .filter((file) => inScope(file) && !measured(file))
      .filter((file) => !/\/(page|layout|loading|error|not-found|template|default)\.tsx$/.test(file))
      .map((file) => {
        const kind = !file.endsWith(".tsx") ? "" : /^["']use client["']/.test(read(file)) ? " (componente de cliente)" : " (del servidor: lo cubren las E2E)";
        const sibling = file.replace(/\.tsx?$/, (ext) => `.test${ext}`);
        return `${file}${kind}${existsSync(join(ROOT, sibling)) ? " · tiene prueba al lado" : " · sin prueba al lado"}`;
      }),
);

// Qué archivos importa cada prueba (rutas relativas o con el alias @/), para saber qué se prueba directo.
function importsOf(file) {
  const resolved = [];
  for (const [, spec] of read(file).matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
    let target;
    if (spec.startsWith("@/")) target = join("src", spec.slice(2));
    else if (spec.startsWith(".")) target = join(dirname(file), spec);
    else continue;
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, join(target, "index.ts")]) {
      if (existsSync(join(ROOT, candidate)) && statSync(join(ROOT, candidate)).isFile()) resolved.push(relative(ROOT, join(ROOT, candidate)));
    }
  }
  return resolved;
}
const testedDirectly = new Set(tests.flatMap(importsOf));
const summaryFile = "coverage/coverage-summary.json";
const summary = existsSync(join(ROOT, summaryFile)) ? JSON.parse(read(summaryFile)) : null;
const coverageOf = (file) => {
  const entry = summary && Object.entries(summary).find(([path]) => path.endsWith(`/${file}`))?.[1];
  return entry ? ` · líneas ${entry.lines.pct}%, ramas ${entry.branches.pct}%` : "";
};

section(
  "Código medido sin ninguna prueba que lo importe",
  "Archivos de `coverage.include` que ninguna prueba importa directamente: pueden estar cubiertos de rebote (mira su cobertura) o sin probar.",
  () => sources.filter((file) => inScope(file) && measured(file) && !testedDirectly.has(file)).map((file) => `${file}${coverageOf(file)}`),
);

section(
  "Archivos bajo el umbral de cobertura",
  `Del último \`pnpm test:coverage\` (${summaryFile}${summary ? `, ${statSync(join(ROOT, summaryFile)).mtime.toISOString().slice(0, 16).replace("T", " ")}` : ""}): menos de 85 % de líneas o 80 % de ramas, del más bajo al más alto.`,
  () => {
    if (!summary) return ["(no hay reporte: corre `pnpm test:coverage` y vuelve a correr este inventario)"];
    return Object.entries(summary)
      .filter(([path]) => path !== "total")
      .map(([path, entry]) => ({ file: relative(ROOT, path), lines: entry.lines.pct, branches: entry.branches.pct }))
      .filter(({ file, lines, branches }) => inScope(file) && (lines < 85 || branches < 80))
      .sort((a, b) => a.lines - b.lines)
      .map(({ file, lines, branches }) => `${file} · líneas ${lines}%, ramas ${branches}%`);
  },
);

const strykerConfig = read("stryker.config.mjs");
const mutate = stringArray(strykerConfig, "mutate");
section(
  "Lógica que Stryker no muta",
  "Archivos .ts de src/lib y src/modules fuera de la lista `mutate` de stryker.config.mjs. Lo que depende de la base se prueba en integración y puede quedar fuera a propósito: decide caso por caso.",
  () =>
    sources
      .filter((file) => inScope(file) && /^src\/(lib|modules)\/.*\.ts$/.test(file) && !mutate.some((p) => matchesGlob(file, p)))
      .map((file) => `${file}${/^import ["']server-only["']/m.test(read(file)) ? " (servidor: usa la base o servicios)" : ""}`),
);

const mutationFile = "reports/mutation/mutation.json";
section(
  "Último reporte de Stryker",
  `${mutationFile}: de qué archivos es (puede ser de una corrida de cambios), su puntaje y los sobrevivientes.`,
  () => {
    if (!existsSync(join(ROOT, mutationFile))) return ["(no hay reporte local: `pnpm test:mutation:cambios`, o el del lunes en Actions → Mutation testing, con permiso para bajarlo)"];
    const report = JSON.parse(read(mutationFile));
    const lines = [`del ${statSync(join(ROOT, mutationFile)).mtime.toISOString().slice(0, 16).replace("T", " ")}`];
    for (const [file, { mutants }] of Object.entries(report.files)) {
      const detected = mutants.filter((m) => ["Killed", "Timeout"].includes(m.status)).length;
      const valid = mutants.filter((m) => !["Ignored", "CompileError", "RuntimeError"].includes(m.status)).length;
      const survived = mutants.filter((m) => ["Survived", "NoCoverage"].includes(m.status));
      lines.push(`${file} · ${valid ? ((detected / valid) * 100).toFixed(2) : "—"}% (${survived.length} sin detectar)`);
      for (const m of survived) lines.push(`  ${file}:${m.location.start.line} ${m.mutatorName}: ${m.replacement ?? ""}`.trimEnd());
    }
    return lines;
  },
);

// Marcas en las pruebas que suelen esconder algo.
const MARKS = [
  [/\b(?:it|test|describe)\.only\(/, "`.only` (las demás no corren)"],
  [/\b(?:it|test|describe)\.skip\(|\bxit\(|\btest\.fixme\(/, "prueba saltada"],
  [/\b(?:it|test)\.fails\(/, "`it.fails` (un error conocido, sin arreglar)"],
  [/\b(?:it|test)\.todo\(/, "prueba pendiente (`todo`)"],
  [/waitForTimeout\(|new Promise\(\s*\(?\w*\)?\s*=>\s*setTimeout\(/, "espera fija (frágil y lenta)"],
  [/\.toBeTruthy\(\)|\.toBeDefined\(\)/, "aserción débil (¿qué valor se espera?)"],
];
/** `expect(valor, "mensaje").toBeDefined()`: una guarda antes de usar el valor, no la aserción de la prueba. */
const isGuard = (line) => /expect\([^)]*,\s*[`'"]/.test(line);
section(
  "Marcas en las pruebas",
  "Pruebas saltadas, con `.only`, que esperan un error, con esperas fijas o con aserciones que pasan con casi cualquier valor.",
  () =>
    tests.filter(inScope).flatMap((file) =>
      read(file)
        .split("\n")
        .flatMap((line, i) =>
          MARKS.filter(([re, label]) => re.test(line) && !(label.startsWith("aserción débil") && isGuard(line))).map(
            ([, label]) => `${file}:${i + 1} ${label}: ${line.trim().slice(0, 100)}`,
          ),
        ),
    ),
);

/** La ruta de una página de src/app (sin los grupos "(app)"), con los segmentos dinámicos como "[id]". */
const routeOf = (page) =>
  `/${dirname(page).replace(/^src\/app\/?/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/")}`;
section(
  "Páginas sin revisión táctil o de diseño",
  "Cada página va en e2e/diseno-tactil.spec.ts y en las vistas de la auditoría de diseño (CLAUDE.md → Celular y tableta). Las dinámicas ([id]) se abren navegando: se verifican a mano.",
  () => {
    const tactil = read("e2e/diseno-tactil.spec.ts");
    const vistas = read(".claude/skills/auditoria-diseno/recorrido/vistas.ts");
    return glob("src/app/**/page.tsx")
      .filter(inScope)
      .flatMap((page) => {
        const route = routeOf(page);
        // Las dinámicas se abren navegando (tocando un movimiento), no por su dirección: se revisan a mano.
        if (route.includes("[")) return [`${route} (${page}) · dinámica: verifica a mano que se abra en las dos`];
        const fixed = route;
        const missing = [!tactil.includes(`"${fixed}`) && !tactil.includes(`\`${fixed}`) && "diseno-tactil", !vistas.includes(fixed) && "vistas de diseño"].filter(Boolean);
        return missing.length ? [`${route} (${page}) · falta en: ${missing.join(" y ")}`] : [];
      });
  },
);

section(
  "Tablas de la persona fuera de la prueba del borrado de la cuenta",
  "Las tablas con clave foránea en cascada hacia `user` se cuentan antes y después en src/modules/account/delete-account.int.test.ts (CLAUDE.md → borrar una cuenta).",
  () => {
    const deletion = read("src/modules/account/delete-account.int.test.ts");
    return glob("src/db/schema/*.ts")
      .filter(inScope)
      .flatMap((file) =>
        [...read(file).matchAll(/export const (\w+) = pgTable\(\s*"(\w+)"([\s\S]*?)\n\);?\n/g)]
          .filter(([, , , body]) => /references\(\(\) => user\.id, \{ onDelete: "cascade" \}\)/.test(body))
          .filter(([, name]) => !new RegExp(`\\b${name}\\b`).test(deletion))
          .map(([, name, table]) => `${name} (${table}, ${file})`),
      );
  },
);

section(
  "Server Actions y rutas sin prueba de integración",
  "Cada Server Action y ruta de API se prueba en integración (con dos usuarios, CLAUDE.md). Aquí, las que ningún *.int.test.ts nombra; la matriz de autorización ya exige que estén clasificadas.",
  () => {
    const integration = glob("src/**/*.int.test.ts").map(read).join("\n");
    const actions = glob("src/**/*.ts")
      .filter((file) => !isTest(file) && inScope(file) && /^["']use server["']/.test(read(file)))
      .flatMap((file) => [...read(file).matchAll(/export async function (\w+)/g)].map(([, name]) => ({ file, name })))
      .filter(({ name }) => !new RegExp(`\\b${name}\\b`).test(integration))
      .map(({ file, name }) => `${name} (${file})`);
    const routes = glob("src/app/**/route.ts")
      .filter(inScope)
      .filter((file) => !integration.includes(basename(dirname(file))) && !glob(`${dirname(file)}/*.int.test.ts`).length)
      .map((file) => `${routeOf(file)} (${file})`);
    return [...actions, ...routes];
  },
);

// El informe.
console.log(`Inventario de pruebas · modo ${mode}${changed ? ` (${changed.size} archivos cambiados frente a origin/main)` : ""}`);
console.log(`${sources.length} archivos de código en src/, ${tests.length} archivos de pruebas.\n`);
for (const { title, what, lines } of sections) {
  console.log(`${title.toUpperCase()} (${lines.length})`);
  console.log(`  ${what}`);
  for (const line of lines.length ? lines : ["nada que revisar"]) console.log(`  - ${line}`);
  console.log("");
}
