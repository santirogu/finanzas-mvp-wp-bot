import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Lo que `pnpm lint` revisa y lo que salta (eslint.config.mjs). Las copias del repo de otras sesiones de Claude
// Code (.claude/worktrees/, cada una con su .next) sumaban miles de problemas ajenos a la rama.

const eslint = new ESLint({ cwd: path.join(__dirname, "..") });

describe("lo que revisa ESLint", () => {
  it.each([".claude/worktrees/otra-sesion/src/lib/auth.ts", ".claude/worktrees/otra-sesion/.next/server/app.js", "coverage/index.js", "reports/x.js"])(
    "salta %s",
    async (file) => {
      expect(await eslint.isPathIgnored(file)).toBe(true);
    },
  );

  it.each(["src/lib/auth.ts", "e2e/helpers.ts", "scripts/admin.ts", ".claude/skills/auditoria-diseno/recorrido/vistas.ts"])("revisa %s", async (file) => {
    expect(await eslint.isPathIgnored(file)).toBe(false);
  });
});
