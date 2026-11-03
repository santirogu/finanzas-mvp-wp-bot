#!/usr/bin/env node
// Auditoría de dependencias del CI: corre `pnpm audit` y distingue una vulnerabilidad de un registro
// de npm que no responde (un timeout del registro frenó así el despliegue de #176).
//
// - Vulnerabilidad alta o crítica (sin las de package.json → pnpm.auditConfig.ignoreGhsas): falla.
// - El registro no responde y pnpm-lock.yaml no cambió: aviso y sigue. Esas dependencias ya pasaron
//   la auditoría: la regla "Proteger main" exige que el PR esté al día con main antes del merge.
// - El registro no responde y pnpm-lock.yaml cambió, o no se pudo comparar: falla, porque hay
//   dependencias que nadie auditó.
// - Cualquier otro error: falla.
//
// Uso: node scripts/dependency-audit.mjs sin-cambios|cambio   (el estado de pnpm-lock.yaml)

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// --ignore-registry-errors solo cubre el pedido al registro: si falla, pnpm sale con 0 y deja el
// mensaje del error en vez del informe. Las vulnerabilidades se evalúan igual que sin la opción.
export const AUDIT_ARGS = ["audit", "--audit-level", "high", "--json", "--ignore-registry-errors"];

const SEVERITY = { critical: "crítica", high: "alta" };

/** Corre `pnpm audit` y devuelve su código de salida y su salida. */
export function runAudit(spawn = spawnSync) {
  // Con avisos, el informe trae las rutas de cada paquete y puede pasar el MB que spawnSync admite
  // por defecto; si lo pasara, cortaría el proceso y el paso fallaría sin decir por qué.
  const result = spawn("pnpm", AUDIT_ARGS, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * Interpreta el resultado de `pnpm audit`. Un aviso en el informe falla siempre; "limpia" exige el
 * informe completo y sin avisos, y solo se considera que el registro falló si pnpm salió con 0 sin
 * el informe (lo que hace --ignore-registry-errors). Cualquier otra cosa es un error.
 *
 * @returns {{ verdict: "limpia" | "vulnerable" | "registro" | "error", advisories?: object[], message?: string }}
 */
export function classifyAudit({ status, stdout, stderr = "" }) {
  const output = stdout.trim();
  let report = null;
  try {
    report = JSON.parse(output);
  } catch {
    // No es el informe: lo decide el código de salida.
  }

  if (report?.advisories != null && report?.metadata != null) {
    const advisories = Object.values(report.advisories);
    if (advisories.length > 0) return { verdict: "vulnerable", advisories };
    if (status === 0) return { verdict: "limpia" };
  } else if (status === 0 && output) {
    return { verdict: "registro", message: output };
  }
  return { verdict: "error", message: [output, stderr.trim()].filter(Boolean).join("\n") };
}

/** Las vulnerabilidades, de la más grave a la menos, con lo necesario para decidir qué hacer. */
export function formatAdvisories(advisories) {
  // Primero las críticas (las demás son altas: la auditoría pide solo esas dos).
  const rank = (advisory) => (advisory.severity === "critical" ? 0 : 1);
  return [...advisories]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((a) => [
      `  • ${SEVERITY[a.severity] ?? a.severity} · ${a.module_name}: ${a.title}`,
      `    Versiones vulnerables: ${a.vulnerable_versions} · corregidas: ${a.patched_versions}`,
      `    ${a.url}`,
    ]);
}

/** Escapa un texto para un comando de GitHub Actions (`::warning::`), que termina en el salto de línea. */
const escapeCommand = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/**
 * Decide desde la línea de comandos y devuelve el código de salida (0 = sigue).
 *
 * @param {string | undefined} lockfile "sin-cambios" si pnpm-lock.yaml no cambió; cualquier otro
 *   valor (o ninguno) cuenta como cambiado.
 * @param {{
 *   audit?: () => { status: number | null, stdout: string, stderr: string },
 *   log?: (line: string) => void,
 *   error?: (line: string) => void,
 *   summaryFile?: string,
 *   append?: (file: string, text: string) => void,
 * }} [options]
 * @returns {number}
 */
export function runCli(
  lockfile,
  {
    audit = runAudit,
    log = console.log,
    error = console.error,
    summaryFile = process.env.GITHUB_STEP_SUMMARY,
    append = appendFileSync,
  } = {},
) {
  const result = classifyAudit(audit());

  if (result.verdict === "limpia") {
    log("✓ Sin vulnerabilidades altas ni críticas.");
    return 0;
  }

  if (result.verdict === "vulnerable") {
    error(`✗ Vulnerabilidades altas o críticas (${result.advisories.length}):\n`);
    error(formatAdvisories(result.advisories).join("\n"));
    error(
      "\nActualiza el paquete (o fuerza la versión corregida en package.json → pnpm.overrides). Si no\n" +
        "tiene versión corregida y no se puede explotar aquí, va en pnpm.auditConfig.ignoreGhsas, con su\n" +
        "porqué en el README (Versiones forzadas de dependencias).",
    );
    return 1;
  }

  if (result.verdict === "registro" && lockfile === "sin-cambios") {
    const warning =
      "El registro de npm no respondió y la auditoría no corrió. pnpm-lock.yaml no cambió: esas " +
      "dependencias ya pasaron la auditoría, así que el CI sigue. La próxima corrida las vuelve a auditar.";
    log(`::warning title=Auditoría de dependencias::${escapeCommand(`${warning}\n${result.message}`)}`);
    if (summaryFile) {
      append(summaryFile, `### Auditoría de dependencias\n\n⚠️ ${warning}\n\n\`\`\`\n${result.message}\n\`\`\`\n`);
    }
    return 0;
  }

  if (result.verdict === "registro") {
    error(
      "✗ El registro de npm no respondió y pnpm-lock.yaml cambió (o no se pudo comparar): hay\n" +
        "  dependencias sin auditar. Vuelve a correr el job cuando npm se recupere\n" +
        "  (https://status.npmjs.org).\n",
    );
    error(result.message);
    return 1;
  }

  error("✗ pnpm audit falló:\n");
  error(result.message || "(sin salida)");
  return 1;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(runCli(process.argv[2]));
