import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli, score, summarize } from "./mutation-summary.mjs";

const mutants = (statuses: string[]) => statuses.map((status) => ({ status }));

describe("score", () => {
  it("cuenta Killed y Timeout como detectados; Survived y NoCoverage como no detectados", () => {
    expect(score(mutants(["Killed", "Timeout", "Survived", "NoCoverage"]))).toEqual({
      detected: 2,
      undetected: 2,
      valid: 4,
      percent: 50,
    });
  });

  it("ignora errores de compilación, de ejecución y mutantes ignorados", () => {
    expect(score(mutants(["Killed", "CompileError", "RuntimeError", "Ignored"])).percent).toBe(100);
  });

  it("sin mutantes válidos el puntaje es 100 %", () => {
    expect(score([]).percent).toBe(100);
  });
});

describe("summarize", () => {
  it("muestra el total y los archivos de peor a mejor", () => {
    const markdown = summarize({
      files: {
        "src/lib/money.ts": { mutants: mutants(["Killed", "Killed", "Killed", "Survived"]) },
        "src/lib/dates.ts": { mutants: mutants(["Killed", "Survived"]) },
      },
    });

    expect(markdown).toContain("### Mutation testing: 66.7 %");
    expect(markdown).toContain("4 de 6 mutantes detectados por las pruebas; 2 sobrevivieron.");
    expect(markdown.indexOf("dates.ts")).toBeLessThan(markdown.indexOf("money.ts"));
    expect(markdown).toContain("| `src/lib/money.ts` | 75.0 % | 1 |");
  });
});

describe("summarize · formato completo", () => {
  it("genera la tabla completa y desempata por cantidad de sobrevivientes", () => {
    const markdown = summarize({
      files: {
        "a.ts": { mutants: mutants(["Killed", "Survived"]) },
        "b.ts": { mutants: mutants(["Killed", "Killed", "Survived", "Survived"]) },
      },
    });
    expect(markdown).toBe(
      [
        "### Mutation testing: 50.0 %",
        "",
        "3 de 6 mutantes detectados por las pruebas; 3 sobrevivieron.",
        "",
        "| Archivo | Puntaje | Sobrevivientes |",
        "|---|---|---|",
        "| `b.ts` | 50.0 % | 2 |",
        "| `a.ts` | 50.0 % | 1 |",
        "",
        "El reporte HTML completo (cada mutante sobreviviente en su línea) está en los artifacts `mutation-report-*` de la corrida.",
      ].join("\n"),
    );
  });
});

describe("runCli", () => {
  const report = JSON.stringify({ files: { "a.ts": { mutants: [{ status: "Killed" }] } } });

  it("imprime el resumen y lo agrega al resumen de la corrida", () => {
    const logs: string[] = [];
    const appended: [string, string][] = [];
    runCli("reporte.json", {
      exists: (path: string) => path === "reporte.json",
      read: () => report,
      log: (l: string) => logs.push(l),
      summaryFile: "/tmp/summary",
      append: (file: string, text: string) => {
        appended.push([file, text]);
      },
    });
    expect(logs[0]).toContain("### Mutation testing: 100.0 %");
    expect(appended).toEqual([["/tmp/summary", `${logs[0]}\n`]]);
  });

  it("junta los reportes de varias partes en un solo resumen, y avisa de la que no tiene", () => {
    const reports: Record<string, string> = {
      "parte-1.json": JSON.stringify({ files: { "a.ts": { mutants: [{ status: "Killed" }, { status: "Survived" }] } } }),
      "parte-2.json": JSON.stringify({ files: { "b.ts": { mutants: [{ status: "Killed" }, { status: "Killed" }] } } }),
    };
    const logs: string[] = [];
    runCli(["parte-1.json", "parte-3.json", "parte-2.json"], {
      exists: (path: string) => path in reports,
      read: (path: string) => reports[path],
      log: (l: string) => logs.push(l),
      summaryFile: undefined,
    });
    expect(logs[0]).toBe("No llegó parte-3.json: Stryker no lo generó o no se pudo subir.");
    expect(logs[1]).toContain("### Mutation testing: 75.0 %");
    expect(logs[1]).toContain("| `a.ts` | 50.0 % | 1 |");
    expect(logs[1]).toContain("| `b.ts` | 100.0 % | 0 |");
    // El resumen dice que falta una parte (debajo del título, en su propio párrafo): el puntaje no es de
    // toda la lista.
    expect(logs[1]).toContain(
      "### Mutation testing: 75.0 %\n\n> **Falta 1 reporte** (`parte-3.json`): Stryker no lo generó o no se pudo subir. El puntaje es solo del resto.\n\n3 de 4 mutantes",
    );
  });

  it("con todos los reportes, no avisa de ninguno; si faltan varios, los nombra", () => {
    const reports: Record<string, string> = { "parte-1.json": report };
    const run = (paths: string[]) => {
      const logs: string[] = [];
      runCli(paths, { exists: (path: string) => path in reports, read: (path: string) => reports[path], log: (l: string) => logs.push(l), summaryFile: undefined });
      return logs.at(-1)!;
    };
    expect(run(["parte-1.json"])).not.toContain("Falta");
    expect(run(["parte-1.json", "parte-2.json", "parte-3.json"])).toContain("> **Faltan 2 reportes** (`parte-2.json`, `parte-3.json`)");
  });

  it("si no llegó ninguno, el resumen de la corrida lo dice", () => {
    const appended: string[] = [];
    runCli(["parte-1.json", "parte-2.json"], {
      exists: () => false,
      log: () => {},
      summaryFile: "/tmp/summary",
      append: (_file: string, text: string) => {
        appended.push(text);
      },
    });
    expect(appended).toEqual([
      "### Mutation testing\n\n> **Faltan 2 reportes** (`parte-1.json`, `parte-2.json`): Stryker no los generó o no se pudieron subir. El puntaje es solo del resto.\n",
    ]);
  });

  it("por defecto lee el archivo de verdad", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mutacion-")), "mutation.json");
    writeFileSync(path, report);
    const logs: string[] = [];
    runCli([path], { log: (l: string) => logs.push(l), summaryFile: undefined });
    expect(logs[0]).toContain("### Mutation testing: 100.0 %");
  });

  it("usa el reporte de Stryker por defecto y avisa si no existe", () => {
    const logs: string[] = [];
    const read = vi.fn();
    runCli(undefined, { exists: () => false, read, log: (l: string) => logs.push(l) });
    expect(logs).toEqual(["No llegó reports/mutation/mutation.json: Stryker no lo generó o no se pudo subir."]);
    expect(read).not.toHaveBeenCalled();
  });

  describe("sin indicar el archivo del resumen", () => {
    afterEach(() => vi.unstubAllEnvs());
    const run = () => {
      const append = vi.fn();
      runCli("r.json", { exists: () => true, read: () => report, log: () => {}, append });
      return append;
    };

    it("en GitHub Actions lo toma de GITHUB_STEP_SUMMARY", () => {
      vi.stubEnv("GITHUB_STEP_SUMMARY", "/tmp/gh-summary");
      expect(run()).toHaveBeenCalledWith("/tmp/gh-summary", expect.stringContaining("100.0 %"));
    });

    it("fuera de GitHub Actions no escribe el resumen de la corrida", () => {
      vi.stubEnv("GITHUB_STEP_SUMMARY", undefined);
      expect(run()).not.toHaveBeenCalled();
    });
  });
});
