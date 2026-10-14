import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkSchemaDrift,
  classifyGenerate,
  diffSnapshots,
  restore,
  snapshot,
} from "./check-schema-drift.mjs";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "drift-"));
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "0000_init.sql"), "CREATE TABLE a ();");
  writeFileSync(join(dir, "meta", "_journal.json"), '{"entries":[1]}');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("snapshot", () => {
  it("lee todos los archivos, incluidas las subcarpetas", () => {
    expect(snapshot(dir)).toEqual({
      "0000_init.sql": "CREATE TABLE a ();",
      [join("meta", "_journal.json")]: '{"entries":[1]}',
    });
  });

  it("devuelve un objeto vacío si la carpeta no existe", () => {
    expect(snapshot(join(dir, "no-existe"))).toEqual({});
  });
});

describe("diffSnapshots", () => {
  it("sin cambios no reporta nada", () => {
    expect(diffSnapshots(snapshot(dir), snapshot(dir))).toEqual({ added: [], modified: [] });
  });

  it("detecta migraciones nuevas y el journal modificado", () => {
    const before = snapshot(dir);
    writeFileSync(join(dir, "0001_schema_drift.sql"), "ALTER TABLE a ADD b int;");
    writeFileSync(join(dir, "meta", "_journal.json"), '{"entries":[1,2]}');

    expect(diffSnapshots(before, snapshot(dir))).toEqual({
      added: ["0001_schema_drift.sql"],
      modified: [join("meta", "_journal.json")],
    });
  });
});

describe("restore", () => {
  it("deja la carpeta exactamente como estaba", () => {
    const before = snapshot(dir);
    writeFileSync(join(dir, "0001_schema_drift.sql"), "ALTER TABLE a ADD b int;");
    writeFileSync(join(dir, "meta", "0001_snapshot.json"), "{}");
    writeFileSync(join(dir, "meta", "_journal.json"), '{"entries":[1,2]}');

    restore(dir, before, diffSnapshots(before, snapshot(dir)));

    expect(snapshot(dir)).toEqual(before);
    expect(readFileSync(join(dir, "meta", "_journal.json"), "utf8")).toBe('{"entries":[1]}');
  });
});

describe("classifyGenerate", () => {
  it("acepta solo si drizzle-kit confirma que no hay cambios", () => {
    expect(
      classifyGenerate({ added: [], output: "No schema changes, nothing to migrate 😴" }),
    ).toBe("ok");
  });

  it("si generó archivos hay drift", () => {
    expect(classifyGenerate({ added: ["0002_schema_drift.sql"], output: "" })).toBe("drift");
  });

  it("si no generó nada ni confirmó, no se puede asumir que está bien (p. ej. renombres)", () => {
    const output =
      "Reading config file\nError: Interactive prompts require a TTY terminal (process.stdin.isTTY…)";
    expect(classifyGenerate({ added: [], output })).toBe("undecided");
    expect(classifyGenerate({ added: [], output: "" })).toBe("undecided");
  });
});

describe("checkSchemaDrift", () => {
  // drizzle-kit simulado: responde a "check" y a "generate" (que puede escribir archivos en dir).
  function run(behavior: {
    check?: { status: number; output: string };
    generate: () => { status: number; output: string };
  }) {
    const logs: string[] = [];
    const errors: string[] = [];
    const code = checkSchemaDrift({
      dir,
      drizzleKit: (args: string[]) =>
        args[0] === "check" ? (behavior.check ?? { status: 0, output: "" }) : behavior.generate(),
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    });
    return { code, logs: logs.join("\n"), errors: errors.join("\n") };
  }

  it("pasa si drizzle-kit confirma que no hay cambios", () => {
    const result = run({
      generate: () => ({ status: 0, output: "No schema changes, nothing to migrate" }),
    });
    expect(result.code).toBe(0);
    expect(result.logs).toContain("coincide con las migraciones");
  });

  it("falla con el SQL pendiente si falta una migración, y deja la carpeta como estaba", () => {
    const before = snapshot(dir);
    const result = run({
      generate: () => {
        writeFileSync(join(dir, "0001_schema_drift.sql"), 'ALTER TABLE "a" ADD COLUMN "b" text;');
        writeFileSync(join(dir, "meta", "_journal.json"), '{"entries":[1,2]}');
        return { status: 0, output: "[✓] Your SQL migration file ➜ drizzle/0001_schema_drift.sql" };
      },
    });

    expect(result.code).toBe(1);
    expect(result.errors).toContain("schema drift");
    expect(result.errors).toContain('ALTER TABLE "a" ADD COLUMN "b" text;');
    expect(snapshot(dir)).toEqual(before);
  });

  it("falla si drizzle-kit necesita una decisión (renombre) aunque termine con código 0", () => {
    const result = run({
      generate: () => ({
        status: 0,
        output:
          "Reading config file 'drizzle.config.ts'\nError: Interactive prompts require a TTY terminal\n    at run (bin.cjs:1:1)",
      }),
    });

    expect(result.code).toBe(1);
    expect(result.errors).toContain("necesita que decidas algo");
    expect(result.errors).toContain("Interactive prompts require a TTY terminal");
    expect(result.errors).not.toContain("at run"); // sin el stack trace
  });

  it("falla si las migraciones existentes no son consistentes", () => {
    const generate = vi.fn();
    const result = run({ check: { status: 1, output: "Error: migration collision" }, generate });

    expect(result.code).toBe(1);
    expect(result.errors).toContain("no son consistentes");
    expect(result.errors).toContain("migration collision");
    expect(generate).not.toHaveBeenCalled();
  });
});
