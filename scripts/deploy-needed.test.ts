import { describe, expect, it } from "vitest";
import { filesRequiringDeploy } from "./deploy-needed.mjs";

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
