import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../stryker.config.mjs";
import { allTargets, changedTargets, gitOutput, isTarget, MAX_SHARDS, runCli, runLocal, runStryker, shard, SHARD_BYTES } from "./mutation-targets.mjs";

const PATTERNS = ["src/lib/{money,dates}.ts", "src/app/*/simulador/actions.ts", "scripts/{smoke,release}.mjs"];
const always = () => true;

describe("isTarget", () => {
  it("los archivos de la lista de stryker.config.mjs, con sus llaves y comodines", () => {
    expect(isTarget("src/lib/money.ts", PATTERNS)).toBe(true);
    expect(isTarget("src/app/(app)/simulador/actions.ts", PATTERNS)).toBe(true);
    expect(isTarget("scripts/release.mjs", PATTERNS)).toBe(true);
  });

  it("no sus pruebas ni los parecidos", () => {
    expect(isTarget("src/lib/money.test.ts", PATTERNS)).toBe(false);
    expect(isTarget("src/lib/moneys.ts", PATTERNS)).toBe(false);
    expect(isTarget("src/app/a/b/simulador/actions.ts", PATTERNS)).toBe(false);
  });

  it("por defecto, la lista de stryker.config.mjs (con este mismo script adentro)", () => {
    expect(isTarget("src/lib/money.ts")).toBe(true);
    expect(isTarget("scripts/mutation-targets.mjs")).toBe(true);
    expect(isTarget("README.md")).toBe(false);
  });
});

describe("changedTargets", () => {
  it("de lo que cambió, solo lo que muta Stryker: sin repetir, en orden y sin espacios", () => {
    const changed = ["README.md", " src/lib/money.ts ", "src/lib/dates.ts", "src/lib/dates.ts", "", "src/lib/money.test.ts"];
    expect(changedTargets(changed, { patterns: PATTERNS, exists: always })).toEqual(["src/lib/dates.ts", "src/lib/money.ts"]);
  });

  it("sin los archivos borrados", () => {
    const exists = (file: string) => file !== "src/lib/dates.ts";
    expect(changedTargets(["src/lib/dates.ts", "src/lib/money.ts"], { patterns: PATTERNS, exists })).toEqual(["src/lib/money.ts"]);
  });

  it("por defecto mira el disco de verdad", () => {
    expect(changedTargets(["src/lib/money.ts", "src/lib/no-existe-este.ts"])).toEqual(["src/lib/money.ts"]);
  });
});

describe("allTargets", () => {
  it("todos los archivos de la lista, sin repetir y en orden", () => {
    const glob = (pattern: string) => (pattern.startsWith("src/lib") ? ["src/lib/money.ts", "src/lib/dates.ts"] : ["src/lib/money.ts"]);
    expect(allTargets({ patterns: PATTERNS, glob })).toEqual(["src/lib/dates.ts", "src/lib/money.ts"]);
  });

  it("por defecto, los de stryker.config.mjs en el disco", () => {
    const files = allTargets();
    expect(files).toContain("src/lib/money.ts");
    expect(files).toContain("src/modules/reports/period.ts");
    expect(files.every((file) => isTarget(file, config.mutate))).toBe(true);
  });
});

describe("shard", () => {
  const sizes: Record<string, number> = { a: 30_000, b: 20_000, c: 15_000, d: 10_000, e: 1_000 };
  const size = (file: string) => sizes[file];

  it("tantas partes como hagan falta para no pasar de SHARD_BYTES, parejas por tamaño", () => {
    // 76 KB: 4 partes. Del más grande al más chico, cada uno a la parte con menos código.
    expect(shard(["e", "d", "c", "b", "a"], { size })).toEqual([
      { parte: "1 de 4", files: "a" },
      { parte: "2 de 4", files: "b" },
      { parte: "3 de 4", files: "c" },
      { parte: "4 de 4", files: "d,e" },
    ]);
  });

  it("lo de un PR chico, en una sola parte (en orden alfabético, no por tamaño)", () => {
    expect(shard(["b", "a"], { size: () => 1_000 })).toEqual([{ parte: "1 de 1", files: "a,b" }]);
    expect(shard(["a", "z"], { size: (f: string) => (f === "z" ? 2_000 : 1_000) })).toEqual([{ parte: "1 de 1", files: "a,z" }]);
  });

  it(`como mucho, ${MAX_SHARDS} partes (y nunca más partes que archivos)`, () => {
    const files = Array.from({ length: 30 }, (_, i) => `f${String(i).padStart(2, "0")}`);
    expect(shard(files, { size: () => SHARD_BYTES })).toHaveLength(MAX_SHARDS);
    expect(shard(["a", "b"], { size: () => SHARD_BYTES * 10 })).toHaveLength(2);
  });

  it("justo en el límite, una parte; un byte más, dos", () => {
    expect(shard(["a", "b"], { size: () => SHARD_BYTES / 2 })).toHaveLength(1);
    expect(shard(["a", "b"], { size: (f: string) => (f === "a" ? SHARD_BYTES / 2 + 1 : SHARD_BYTES / 2) })).toHaveLength(2);
  });

  it("archivos vacíos van en una parte; sin archivos, ninguna", () => {
    expect(shard(["a"], { size: () => 0 })).toEqual([{ parte: "1 de 1", files: "a" }]);
    expect(shard([], { size })).toEqual([]);
  });

  it("si pesan lo mismo, en orden alfabético (siempre las mismas partes)", () => {
    expect(shard(["b", "a"], { size: () => SHARD_BYTES })).toEqual([
      { parte: "1 de 2", files: "a" },
      { parte: "2 de 2", files: "b" },
    ]);
  });

  it("por defecto, el tamaño de verdad de cada archivo", () => {
    expect(shard(["src/lib/money.ts"])).toEqual([{ parte: "1 de 1", files: "src/lib/money.ts" }]);
  });
});

describe("runCli", () => {
  const deps = { patterns: PATTERNS, exists: always, size: () => 1_000 };

  it("en un PR: los archivos que muta, la explicación y las partes en GITHUB_OUTPUT", () => {
    const logs: string[] = [];
    const appended: [string, string][] = [];
    const parts = runCli("cambios", "README.md\nsrc/lib/money.ts\nsrc/lib/dates.ts\n", {
      ...deps,
      log: (line: string) => logs.push(line),
      outputFile: "/tmp/out",
      append: (file: string, text: string) => appended.push([file, text]),
    });
    expect(parts).toEqual([{ parte: "1 de 1", files: "src/lib/dates.ts,src/lib/money.ts" }]);
    expect(logs).toEqual(["Los archivos del PR que muta Stryker (2), en 1 parte:", "  • Parte 1 de 1: src/lib/dates.ts, src/lib/money.ts"]);
    expect(appended).toEqual([["/tmp/out", `count=2\nmatrix=${JSON.stringify(parts)}\n`]]);
  });

  it("si el PR no cambia nada de la lista, lo dice y no hay partes", () => {
    const logs: string[] = [];
    const append = vi.fn();
    runCli("cambios", "README.md\ne2e/reportes.spec.ts\n", { ...deps, log: (line: string) => logs.push(line), outputFile: "/tmp/out", append });
    expect(logs).toEqual(["El PR no cambia ningún archivo de la lista de stryker.config.mjs: no hay nada que mutar."]);
    expect(append).toHaveBeenCalledWith("/tmp/out", "count=0\nmatrix=[]\n");
  });

  it("la corrida completa, en varias partes", () => {
    const logs: string[] = [];
    const glob = () => ["src/lib/money.ts", "src/lib/dates.ts"];
    const parts = runCli("todos", "", { ...deps, glob, size: () => SHARD_BYTES, log: (line: string) => logs.push(line), outputFile: undefined });
    expect(parts.map((p) => p.parte)).toEqual(["1 de 2", "2 de 2"]);
    expect(logs[0]).toBe("La lista completa de stryker.config.mjs (2), en 2 partes:");
  });

  describe("sin indicar el archivo de salida", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("en GitHub Actions lo toma de GITHUB_OUTPUT; fuera, no escribe nada", () => {
      const append = vi.fn();
      vi.stubEnv("GITHUB_OUTPUT", "/tmp/gh-output");
      runCli("cambios", "src/lib/money.ts", { ...deps, log: () => {}, append });
      expect(append).toHaveBeenCalledWith("/tmp/gh-output", expect.stringContaining("count=1"));
      vi.stubEnv("GITHUB_OUTPUT", undefined);
      append.mockClear();
      runCli("cambios", "src/lib/money.ts", { ...deps, log: () => {}, append });
      expect(append).not.toHaveBeenCalled();
    });
  });
});

describe("runLocal", () => {
  const git = (outputs: Record<string, string>) => (args: string[]) => outputs[args.join(" ")] ?? "";

  it("muta lo cambiado frente a origin/main, lo que no está en un commit y los archivos nuevos", () => {
    const run = vi.fn(() => 0);
    const logs: string[] = [];
    const code = runLocal({
      // Cada consulta trae un archivo distinto: las tres cuentan.
      git: git({
        "diff --name-only origin/main...HEAD": "src/lib/money.ts\nREADME.md\n",
        // Sin el salto de línea final: igual se separa del siguiente.
        "diff --name-only HEAD": "src/lib/dates.ts",
        "ls-files --others --exclude-standard": "scripts/smoke.mjs\n",
      }),
      run,
      log: (line: string) => logs.push(line),
      patterns: PATTERNS,
      exists: always,
    });
    expect(code).toBe(0);
    expect(run).toHaveBeenCalledWith("scripts/smoke.mjs,src/lib/dates.ts,src/lib/money.ts");
    expect(logs).toEqual(["Stryker muta 3 archivos: scripts/smoke.mjs, src/lib/dates.ts, src/lib/money.ts"]);
  });

  it("con un solo archivo lo dice en singular, y devuelve lo que devuelva Stryker", () => {
    const logs: string[] = [];
    const code = runLocal({
      git: git({ "diff --name-only HEAD": "src/lib/money.ts" }),
      run: () => 1,
      log: (line: string) => logs.push(line),
      patterns: PATTERNS,
      exists: always,
    });
    expect(code).toBe(1);
    expect(logs).toEqual(["Stryker muta 1 archivo: src/lib/money.ts"]);
  });

  it("sin cambios en la lista, no corre Stryker", () => {
    const run = vi.fn(() => 0);
    const logs: string[] = [];
    expect(runLocal({ git: git({ "diff --name-only HEAD": "README.md" }), run, log: (line: string) => logs.push(line), patterns: PATTERNS })).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(logs).toEqual(["No cambiaste ningún archivo de la lista de stryker.config.mjs frente a origin/main: no hay nada que mutar."]);
  });
});

describe("gitOutput", () => {
  it("lo que imprime git, como texto", () => {
    expect(gitOutput(["rev-parse", "--is-inside-work-tree"]).trim()).toBe("true");
  });
});

describe("runStryker", () => {
  it("corre Stryker sobre esos archivos, con su salida en la terminal, y devuelve su código", () => {
    const spawn = vi.fn(() => ({ status: 3 }));
    expect(runStryker("a.ts,b.ts", spawn as never)).toBe(3);
    expect(spawn).toHaveBeenCalledWith("pnpm", ["exec", "stryker", "run", "--mutate", "a.ts,b.ts"], { stdio: "inherit" });
  });

  it("si no llegó a terminar (sin código), falla", () => {
    expect(runStryker("a.ts", (() => ({ status: null })) as never)).toBe(1);
  });
});
