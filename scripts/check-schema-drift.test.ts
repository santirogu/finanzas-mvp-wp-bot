import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyGenerate, diffSnapshots, restore, snapshot } from "./check-schema-drift.mjs";

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
