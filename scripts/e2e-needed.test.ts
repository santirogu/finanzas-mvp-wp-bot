import { afterEach, describe, expect, it, vi } from "vitest";
import { filesRequiringDeploy } from "./deploy-needed.mjs";
import { filesRequiringE2E, runCli } from "./e2e-needed.mjs";

// Lo que se salta: documentación, skills, otros workflows, pruebas que no son E2E y herramientas.
const SKIPPED: [string, string[]][] = [
  ["documentación y licencia", ["README.md", "CLAUDE.md", "AGENTS.md", ".github/pull_request_template.md", "LICENSE"]],
  ["skills de Claude Code", [".claude/skills/auditoria-diseno/recorrido/vistas.ts", ".claude/settings.json"]],
  [
    "otros workflows y el CLI de Vercel",
    [".github/workflows/codeql.yml", ".github/workflows/mutation.yml", ".github/vercel-cli/package.json", ".github/dependabot.yml"],
  ],
  [
    "pruebas que no son E2E",
    [
      "src/lib/money.test.ts",
      "src/app/(app)/admin/bot/filter-bar.test.tsx",
      "src/modules/admin/bot/bot-activity.int.test.ts",
      "scripts/admin.test.ts",
      "test/e2e-en-ci.test.ts",
      "test/integration/setup.ts",
    ],
  ],
  ["herramientas de desarrollo", ["scripts/bot-eval.ts", "scripts/db-backup.ts", "scripts/release.mjs", "scripts/meta-subscribe.sh"]],
  [
    "configuración de otras herramientas",
    [
      "eslint.config.mjs",
      "vitest.config.mts",
      "vitest.mutation.config.mts",
      "stryker.config.mjs",
      ".env.example",
      "docker-compose.yml",
      ".gitignore",
      ".githooks/commit-msg",
      ".zap/rules.tsv",
      "docker/init-test-db.sql",
    ],
  ],
];

// Lo que las E2E ejercitan: la app, las propias E2E y lo que usan, y el workflow que las corre.
const REQUIRED = [
  "src/modules/bot/interpret.ts",
  "src/app/(app)/admin/bot/page.tsx",
  "src/app/globals.css",
  "public/app-icon-1024.png",
  "drizzle/0002_nueva_tabla.sql",
  "package.json",
  "pnpm-lock.yaml",
  ".npmrc",
  "next.config.ts",
  "vercel.json",
  "tsconfig.json",
  "e2e/flujo-principal.spec.ts",
  "e2e/helpers.ts",
  "e2e/fake-services.mjs",
  // Playwright también corre los *.test.ts de e2e/.
  "e2e/nueva.test.ts",
  "playwright.config.ts",
  "test/totp.ts",
  "test/reset-database.ts",
  "scripts/admin.ts",
  "scripts/db-cli.ts",
  "scripts/seed.ts",
  ".github/workflows/ci.yml",
  "un-archivo-nuevo-desconocido.ts",
];

describe("filesRequiringE2E", () => {
  it.each(SKIPPED)("se saltan si solo cambia %s", (_, files) => {
    expect(filesRequiringE2E(files)).toEqual([]);
  });

  it.each(REQUIRED)("corren si cambia %s", (file) => {
    expect(filesRequiringE2E(["README.md", file])).toEqual([file]);
  });

  it("las reglas solo aplican en la raíz del repo y con el nombre exacto", () => {
    const lookalikes = [
      "src/.claude/x.ts",
      "src/.githooks/x.ts",
      "src/.github/x.ts",
      "src/.zap/x.ts",
      "src/LICENSE",
      "eslint.config.mjs.bak",
      ".gitignore.ts",
      "src/scripts/importar.ts",
      "src/test/integration/x.ts",
      "src/docker/config.ts",
      "src/eslint.config.mjs",
      "src/components/markdown.mdx",
      "src/lib/money.test.ts.orig",
      "e2e/flujo.test.ts.bak",
      "scripts/admin.tsx",
      "LICENSE.ts",
      ".github/workflows/ci.yml.bak",
    ];
    expect(filesRequiringE2E(lookalikes)).toEqual(lookalikes.filter((f) => f !== "scripts/admin.tsx" && f !== ".github/workflows/ci.yml.bak"));
  });

  it("ignora líneas vacías de la salida de git diff", () => {
    expect(filesRequiringE2E(["", "  ", "README.md", ""])).toEqual([]);
  });

  // Si las E2E se saltan, el despliegue también: nunca llega a producción algo que no probaron.
  it("todo lo que salta las E2E también salta el despliegue", () => {
    const skipped = SKIPPED.flatMap(([, files]) => files);
    expect(filesRequiringDeploy(skipped)).toEqual([]);
    const deployed = filesRequiringDeploy(REQUIRED);
    expect(filesRequiringE2E(deployed)).toEqual(deployed);
  });
});

describe("runCli", () => {
  function run(input: string, outputFile?: string) {
    const lines: string[] = [];
    const appended: [string, string][] = [];
    const e2e = runCli(input, {
      log: (line: string) => lines.push(line),
      outputFile,
      append: (file: string, text: string) => {
        appended.push([file, text]);
      },
    });
    return { e2e, output: lines.join("\n"), appended };
  }

  it("explica qué archivos obligan a correrlas y lo escribe en GITHUB_OUTPUT", () => {
    const result = run("README.md\nsrc/lib/money.ts\n", "/tmp/github-output");
    expect(result.e2e).toBe(true);
    expect(result.output).toBe("Las E2E corren. Archivos que ejercitan (1):\n  • src/lib/money.ts");
    expect(result.appended).toEqual([["/tmp/github-output", "e2e=true\n"]]);
  });

  it("lista los archivos cuando se saltan", () => {
    const result = run("README.md\n.claude/skills/x/SKILL.md\n", "/tmp/github-output");
    expect(result.e2e).toBe(false);
    expect(result.output).toBe(
      "Se saltan las E2E: no ejercitan ninguno de los 2 archivos cambiados.\n  · README.md\n  · .claude/skills/x/SKILL.md",
    );
    expect(result.appended).toEqual([["/tmp/github-output", "e2e=false\n"]]);
  });

  it("sin lista de archivos corren por seguridad", () => {
    const result = run("\n  \n");
    expect(result.e2e).toBe(true);
    expect(result.output).toBe("No se recibió la lista de archivos cambiados: las E2E corren por seguridad.");
  });

  describe("sin indicar el archivo de salida", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("en GitHub Actions lo toma de GITHUB_OUTPUT", () => {
      vi.stubEnv("GITHUB_OUTPUT", "/tmp/gh-output");
      expect(run("src/lib/money.ts").appended).toEqual([["/tmp/gh-output", "e2e=true\n"]]);
    });

    it("fuera de GitHub Actions no escribe nada", () => {
      vi.stubEnv("GITHUB_OUTPUT", "");
      expect(run("src/lib/money.ts").appended).toEqual([]);
    });
  });
});
