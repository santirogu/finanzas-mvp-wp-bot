import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Los logs (Vercel) no deben guardar datos personales. El mensaje de un error de la base trae los
// parámetros de la consulta (teléfonos, textos de mensajes, montos), así que un error nunca se
// imprime crudo: se pasa por describeError (src/lib/safe-log.ts), que da solo su tipo y su código.
// Si agregas un console.* con un error, esta prueba te lo pide.

const ROOT = resolve(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const sources = walk(join(ROOT, "src")).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

/** Un console.* que recibe un error (`err`, `error`, `e`, `cause`) como argumento directo. */
const RAW_ERROR_LOG = /console\.\w+\((?:[^;]*,\s*|\s*)(?:err|error|e|cause)\s*[,)]/;

describe("logs", () => {
  it("la regla detecta un error crudo y deja pasar describeError", () => {
    expect(RAW_ERROR_LOG.test('console.error("[bot] falló", msg.id, error);')).toBe(true);
    expect(RAW_ERROR_LOG.test("console.error(err);")).toBe(true);
    expect(RAW_ERROR_LOG.test('console.warn("x", e, "y");')).toBe(true);
    expect(RAW_ERROR_LOG.test('console.error("[bot] falló", msg.id, describeError(error));')).toBe(false);
    expect(RAW_ERROR_LOG.test('console.info("[bot] listo", { error });')).toBe(false);
  });

  it("ningún console.* del código imprime un error crudo", () => {
    const offenders = sources
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => ({ line, at: `${relative(ROOT, file)}:${i + 1}` })),
      )
      .filter(({ line }) => RAW_ERROR_LOG.test(line))
      .map(({ at }) => at);
    expect(offenders).toEqual([]);
  });
});
