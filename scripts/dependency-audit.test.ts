import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIT_ARGS, classifyAudit, formatAdvisories, runAudit, runCli } from "./dependency-audit.mjs";

const advisory = (severity: string, module_name: string) => ({
  severity,
  module_name,
  title: `Falla en ${module_name}`,
  vulnerable_versions: "<2.0.0",
  patched_versions: ">=2.0.0",
  url: `https://github.com/advisories/GHSA-${module_name}`,
});

/** Lo que imprime `pnpm audit --json` cuando el registro responde. */
const report = (advisories: Record<string, unknown> = {}) =>
  JSON.stringify({ actions: [], advisories, muted: [], metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } } });

/** Lo que imprime con --ignore-registry-errors si el pedido al registro falla (salida real de pnpm 10). */
const TIMEOUT = "request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed, reason: Socket timeout";

describe("runAudit", () => {
  it("pide el informe en JSON, solo altas y críticas, sin fallar por el registro", () => {
    expect(AUDIT_ARGS).toEqual(["audit", "--audit-level", "high", "--json", "--ignore-registry-errors"]);
    const spawn = vi.fn().mockReturnValue({ status: 0, stdout: report(), stderr: "" });

    expect(runAudit(spawn)).toEqual({ status: 0, stdout: report(), stderr: "" });
    expect(spawn).toHaveBeenCalledWith("pnpm", AUDIT_ARGS, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  });

  it("tolera que el proceso no devuelva salida (p. ej. si se cortó)", () => {
    const spawn = vi.fn().mockReturnValue({ status: null, stdout: null, stderr: null });
    expect(runAudit(spawn)).toEqual({ status: null, stdout: "", stderr: "" });
  });
});

describe("classifyAudit", () => {
  it("sin avisos y con código 0 está limpia", () => {
    expect(classifyAudit({ status: 0, stdout: `${report()}\n` })).toEqual({ verdict: "limpia" });
  });

  it("con avisos es vulnerable", () => {
    const advisories = { 1: advisory("high", "a"), 2: advisory("critical", "b") };
    expect(classifyAudit({ status: 1, stdout: report(advisories) })).toEqual({
      verdict: "vulnerable",
      advisories: [advisory("high", "a"), advisory("critical", "b")],
    });
  });

  it("un aviso en el informe falla aunque pnpm salga con 0", () => {
    expect(classifyAudit({ status: 0, stdout: report({ 1: advisory("high", "a") }) }).verdict).toBe("vulnerable");
  });

  it("código 0 sin el informe es el registro que no respondió", () => {
    expect(classifyAudit({ status: 0, stdout: `${TIMEOUT}\n` })).toEqual({ verdict: "registro", message: TIMEOUT });
  });

  it.each([
    ["el informe sin avisos con código 1", { status: 1, stdout: report() }, report()],
    [
      "un error de pnpm (sin --ignore-registry-errors o antes del pedido, p. ej. sin lockfile)",
      { status: 1, stdout: '{"error":{"code":"ERR_PNPM_AUDIT_NO_LOCKFILE"}}' },
      '{"error":{"code":"ERR_PNPM_AUDIT_NO_LOCKFILE"}}',
    ],
    ["código 0 sin ninguna salida", { status: 0, stdout: "  \n" }, ""],
    ["un proceso cortado", { status: null, stdout: "", stderr: "Killed\n" }, "Killed"],
    ["JSON que no es el informe", { status: 1, stdout: '{"advisories":{}}', stderr: "aviso" }, '{"advisories":{}}\naviso'],
  ])("es un error: %s", (_, result, message) => {
    expect(classifyAudit(result)).toEqual({ verdict: "error", message });
  });
});

describe("formatAdvisories", () => {
  it("lista primero las críticas, con las versiones y el enlace", () => {
    expect(formatAdvisories([advisory("high", "a"), advisory("critical", "b")])).toEqual([
      "  • crítica · b: Falla en b",
      "    Versiones vulnerables: <2.0.0 · corregidas: >=2.0.0",
      "    https://github.com/advisories/GHSA-b",
      "  • alta · a: Falla en a",
      "    Versiones vulnerables: <2.0.0 · corregidas: >=2.0.0",
      "    https://github.com/advisories/GHSA-a",
    ]);
  });

  it("una gravedad desconocida se muestra tal cual", () => {
    expect(formatAdvisories([advisory("severa", "c")])[0]).toBe("  • severa · c: Falla en c");
  });
});

describe("runCli", () => {
  function run(lockfile: string | undefined, result: { status: number | null; stdout: string; stderr?: string }, summaryFile?: string) {
    const logs: string[] = [];
    const errors: string[] = [];
    const appended: [string, string][] = [];
    const code = runCli(lockfile, {
      audit: () => ({ stderr: "", ...result }),
      log: (line: string) => logs.push(line),
      error: (line: string) => errors.push(line),
      summaryFile,
      append: (file: string, text: string) => {
        appended.push([file, text]);
      },
    });
    return { code, log: logs.join("\n"), error: errors.join("\n"), appended };
  }

  it("sin vulnerabilidades sigue", () => {
    expect(run("cambio", { status: 0, stdout: report() })).toEqual({
      code: 0,
      log: "✓ Sin vulnerabilidades altas ni críticas.",
      error: "",
      appended: [],
    });
  });

  it.each(["sin-cambios", "cambio"])("una vulnerabilidad falla siempre (lockfile: %s)", (lockfile) => {
    const result = run(lockfile, { status: 1, stdout: report({ 1: advisory("critical", "next") }) });
    expect(result.code).toBe(1);
    expect(result.error).toContain("✗ Vulnerabilidades altas o críticas (1):");
    expect(result.error).toContain("  • crítica · next: Falla en next");
    expect(result.error).toContain("pnpm.auditConfig.ignoreGhsas");
    expect(result.log).toBe("");
  });

  it("si el registro no responde y pnpm-lock.yaml no cambió, sigue con un aviso", () => {
    const result = run("sin-cambios", { status: 0, stdout: TIMEOUT }, "/tmp/resumen");
    expect(result.code).toBe(0);
    expect(result.error).toBe("");
    expect(result.log).toMatch(/^::warning title=Auditoría de dependencias::El registro de npm no respondió/);
    // El aviso es una sola línea: el salto antes del detalle va escapado.
    expect(result.log).toContain(`el CI sigue. La próxima corrida las vuelve a auditar.%0A${TIMEOUT}`);
    expect(result.log).not.toContain("\n");
    expect(result.appended).toEqual([
      ["/tmp/resumen", expect.stringMatching(/^### Auditoría de dependencias\n\n⚠️ El registro de npm no respondió/)],
    ]);
    expect(result.appended[0][1]).toContain(`\`\`\`\n${TIMEOUT}\n\`\`\`\n`);
  });

  it("escapa en el aviso los caracteres que GitHub interpreta", () => {
    const result = run("sin-cambios", { status: 0, stdout: "falló al 100%\r\notra línea" });
    expect(result.log).toContain("falló al 100%25%0D%0Aotra línea");
  });

  it.each([
    ["cambió", "cambio"],
    ["no se pudo comparar", undefined],
    ["llegó otro valor", "sin cambios"],
  ])("si el registro no responde y pnpm-lock.yaml %s, falla", (_, lockfile) => {
    const result = run(lockfile, { status: 0, stdout: TIMEOUT }, "/tmp/resumen");
    expect(result.code).toBe(1);
    expect(result.error).toContain("✗ El registro de npm no respondió y pnpm-lock.yaml cambió (o no se pudo comparar)");
    expect(result.error).toContain(TIMEOUT);
    expect(result.log).toBe("");
    expect(result.appended).toEqual([]);
  });

  it("cualquier otro error falla y muestra la salida", () => {
    const result = run("sin-cambios", { status: 1, stdout: '{"error":{"code":"ERR_PNPM_AUDIT_NO_LOCKFILE"}}' });
    expect(result.code).toBe(1);
    expect(result.error).toBe('✗ pnpm audit falló:\n\n{"error":{"code":"ERR_PNPM_AUDIT_NO_LOCKFILE"}}');
  });

  it("un error sin salida lo dice", () => {
    expect(run("sin-cambios", { status: null, stdout: "" }).error).toBe("✗ pnpm audit falló:\n\n(sin salida)");
  });

  describe("sin indicar el archivo del resumen", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("en GitHub Actions lo toma de GITHUB_STEP_SUMMARY", () => {
      vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/gh-summary");
      const appended: string[] = [];
      runCli("sin-cambios", {
        audit: () => ({ status: 0, stdout: TIMEOUT, stderr: "" }),
        log: () => {},
        append: (file: string) => {
          appended.push(file);
        },
      });
      expect(appended).toEqual(["/tmp/gh-summary"]);
    });

    it("fuera de GitHub Actions no escribe nada", () => {
      vi.stubEnv("GITHUB_STEP_SUMMARY", undefined);
      expect(run("sin-cambios", { status: 0, stdout: TIMEOUT }).appended).toEqual([]);
    });
  });
});
