import { afterEach, describe, expect, it, vi } from "vitest";
import { filesRequiringDeploy, runCli } from "./deploy-needed.mjs";

describe("filesRequiringDeploy", () => {
  it.each([
    ["documentación y licencia", ["README.md", "CLAUDE.md", "AGENTS.md", "LICENSE"]],
    ["workflows de CI", [".github/workflows/ci.yml", ".github/workflows/pull-request.yml"]],
    [
      "pruebas",
      [
        "src/lib/money.test.ts",
        "src/modules/bot/handle-message.int.test.ts",
        "test/integration/setup.ts",
      ],
    ],
    [
      "herramientas de desarrollo",
      ["scripts/bot-eval.ts", "scripts/meta-subscribe.sh", "scripts/conventional-commit.mjs"],
    ],
    [
      "configuración local",
      [
        "eslint.config.mjs",
        "vitest.config.mts",
        "vitest.mutation.config.mts",
        "stryker.config.mjs",
        ".env.example",
        "docker-compose.yml",
        ".gitignore",
        ".githooks/commit-msg",
        "docker/init-test-db.sql",
      ],
    ],
  ])("no despliega si solo cambia %s", (_, files) => {
    expect(filesRequiringDeploy(files)).toEqual([]);
  });

  it.each([
    "src/modules/bot/interpret.ts",
    "src/app/(app)/dashboard/page.tsx",
    "public/app-icon-1024.png",
    "drizzle/0002_nueva_tabla.sql",
    "scripts/seed.ts",
    "package.json",
    "pnpm-lock.yaml",
    "next.config.ts",
    "vercel.json",
    "tsconfig.json",
    "un-archivo-nuevo-desconocido.ts",
  ])("despliega si cambia %s", (file) => {
    expect(filesRequiringDeploy(["README.md", file])).toEqual([file]);
  });

  it("ignora líneas vacías de la salida de git diff", () => {
    expect(filesRequiringDeploy(["", "  ", "README.md", ""])).toEqual([]);
  });
});

describe("filesRequiringDeploy · las reglas solo aplican en la raíz del repo", () => {
  // Una regla sin "^" o sin "$" dejaría de desplegar código real que solo se parece a una exclusión.
  it.each([
    "src/test/helpers.ts",
    "src/scripts/importar.ts",
    "src/docker/config.ts",
    "src/.github/config.ts",
    "src/.githooks/x.ts",
    "src/.claude/x.ts",
    "src/components/markdown.mdx",
    "src/lib/money.test.ts.orig",
    "src/eslint.config.mjs",
    "src/LICENSE",
    "LICENSE.ts",
  ])("despliega %s", (file) => {
    expect(filesRequiringDeploy([file])).toEqual([file]);
  });

  it("solo scripts/seed.ts despliega: otros scripts que empiezan igual son herramientas", () => {
    expect(filesRequiringDeploy(["scripts/seed.ts.bak", "scripts/seed.tsx"])).toEqual([]);
  });
});

describe("runCli", () => {
  function run(input: string, outputFile?: string) {
    const lines: string[] = [];
    const appended: [string, string][] = [];
    const deploy = runCli(input, {
      log: (line: string) => lines.push(line),
      outputFile,
      append: (file: string, text: string) => {
        appended.push([file, text]);
      },
    });
    return { deploy, output: lines.join("\n"), appended };
  }

  it("explica qué archivos obligan a desplegar y lo escribe en GITHUB_OUTPUT", () => {
    const result = run("README.md\nsrc/lib/money.ts\n", "/tmp/github-output");
    expect(result.deploy).toBe(true);
    expect(result.output).toBe(
      "Se despliega. Archivos que afectan la app (1):\n  • src/lib/money.ts",
    );
    expect(result.appended).toEqual([["/tmp/github-output", "deploy=true\n"]]);
  });

  it("lista los archivos cuando no hace falta desplegar", () => {
    const result = run("README.md\n.github/workflows/ci.yml\n", "/tmp/github-output");
    expect(result.deploy).toBe(false);
    expect(result.output).toBe(
      "No se despliega: los 2 archivos cambiados no afectan la app.\n  · README.md\n  · .github/workflows/ci.yml",
    );
    expect(result.appended).toEqual([["/tmp/github-output", "deploy=false\n"]]);
  });

  it("sin lista de archivos despliega por seguridad", () => {
    const result = run("\n  \n");
    expect(result.deploy).toBe(true);
    expect(result.output).toBe(
      "No se recibió la lista de archivos cambiados: se despliega por seguridad.",
    );
  });

  describe("sin indicar el archivo de salida", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("en GitHub Actions lo toma de GITHUB_OUTPUT", () => {
      vi.stubEnv("GITHUB_OUTPUT", "/tmp/gh-output");
      expect(run("src/lib/money.ts").appended).toEqual([["/tmp/gh-output", "deploy=true\n"]]);
    });

    it("fuera de GitHub Actions no escribe nada", () => {
      vi.stubEnv("GITHUB_OUTPUT", undefined);
      expect(run("src/lib/money.ts").appended).toEqual([]);
    });
  });
});
