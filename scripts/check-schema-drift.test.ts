import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkSchemaDrift,
  classifyGenerate,
  drizzleKit,
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

  it("genera la migración de prueba con un nombre fijo", () => {
    const calls: string[][] = [];
    checkSchemaDrift({
      dir,
      drizzleKit: (args: string[]) => {
        calls.push(args);
        return { status: 0, output: "No schema changes" };
      },
      log: () => {},
      error: () => {},
    });
    expect(calls).toEqual([["check"], ["generate", "--name", "schema_drift"]]);
  });

  it("muestra solo el SQL pendiente (no los snapshots JSON) y cómo generar la migración", () => {
    const result = run({
      generate: () => {
        writeFileSync(join(dir, "0001_schema_drift.sql"), "ALTER TABLE a ADD b int;");
        writeFileSync(join(dir, "meta", "0001_snapshot.json"), '{"version":"7"}');
        return { status: 0, output: "" };
      },
    });

    expect(result.errors).toContain("SQL pendiente (0001_schema_drift.sql):\n\nALTER TABLE a ADD b int;\n");
    expect(result.errors).not.toContain('{"version":"7"}');
    expect(result.errors).toContain(
      "Genera la migración y súbela en el mismo PR:\n" +
        "  pnpm db:generate --name <descripcion>   (p. ej. --name agregar-presupuestos)\n" +
        "  git add drizzle/",
    );
  });

  it("explica cómo resolver un renombre y resume el error: sin stack trace ni ruido, máximo 5 líneas", () => {
    const output = [
      "No config path provided, using default 'drizzle.config.ts'",
      "Reading config file 'drizzle.config.ts'",
      "Error: Interactive prompts require a TTY terminal",
      "    at run (bin.cjs:1:1)",
      "   ",
      "línea 2",
      "dato: at hora",
      "falló Reading config",
      "línea 5",
      "línea 6",
    ].join("\n");
    const result = run({ generate: () => ({ status: 0, output }) });

    expect(result.errors).toBe(
      "✗ drizzle-kit no pudo comparar el esquema: necesita que decidas algo (por ejemplo, si una\n" +
        "  columna o tabla se renombró o es nueva) o falló.\n\n" +
        "  Genera la migración en tu terminal y responde sus preguntas:\n" +
        "    pnpm db:generate --name <descripcion>\n\n" +
        "Detalle:\nError: Interactive prompts require a TTY terminal\nlínea 2\ndato: at hora\nfalló Reading config\nlínea 5",
    );
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

describe("drizzleKit", () => {
  it("corre drizzle-kit sin terminal, con timeout, y devuelve su salida sin colores", () => {
    const spawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: "\x1b[32mNo schema changes\x1b[0m",
      stderr: "\x1b[33maviso\x1b[0m",
    });

    expect(drizzleKit(["generate", "--name", "x"], spawn)).toEqual({
      status: 0,
      output: "No schema changes\naviso",
    });
    expect(spawn).toHaveBeenCalledWith("pnpm", ["exec", "drizzle-kit", "generate", "--name", "x"], {
      encoding: "utf8",
      input: "",
      timeout: 120_000,
    });
  });

  it("tolera que el proceso no devuelva salida (p. ej. si se cortó por timeout)", () => {
    const spawn = vi.fn().mockReturnValue({ status: null, stdout: null, stderr: null });
    expect(drizzleKit(["check"], spawn)).toEqual({ status: null, output: "\n" });
  });
});

describe("snapshot · detalles", () => {
  it("ignora entradas que no son archivos ni carpetas (p. ej. enlaces simbólicos rotos)", async () => {
    const { symlinkSync } = await import("node:fs");
    // "0-…" queda primero al listar: si se intentara leer, cortaría el recorrido antes del resto.
    symlinkSync(join(dir, "no-existe"), join(dir, "0-enlace-roto"));
    expect(snapshot(dir)).toEqual({
      "0000_init.sql": "CREATE TABLE a ();",
      [join("meta", "_journal.json")]: '{"entries":[1]}',
    });
  });

  it("propaga errores distintos a 'la carpeta no existe'", () => {
    const file = join(dir, "0000_init.sql");
    expect(() => snapshot(file)).toThrow(); // es un archivo, no una carpeta (ENOTDIR)
  });

  it("ordena los archivos agregados y modificados", () => {
    const before = { "b.sql": "1", "a.sql": "1" };
    const after = { "b.sql": "2", "a.sql": "2", "d.sql": "x", "c.sql": "x" };
    expect(diffSnapshots(before, after)).toEqual({
      added: ["c.sql", "d.sql"],
      modified: ["a.sql", "b.sql"],
    });
  });
});
