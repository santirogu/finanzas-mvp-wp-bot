import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest trata lo que devuelve un beforeEach o un beforeAll como la limpieza de ese hook y lo llama
// al terminar. Con cuerpo de expresión, `beforeEach(() => mock.mockReset())` devuelve el mock (así
// funciona mockReset), y Vitest lo llama una vez de más después de cada prueba: si ese mock lanza un
// error, la prueba falla sin ninguna aserción rota. Los hooks de antes van con llaves.

const ROOT = join(__dirname, "..");
const DIRS = ["src", "scripts", "test", "e2e"];

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : testFiles(path);
    return /\.(test|spec)\.tsx?$|setup\.ts$/.test(name) ? [path] : [];
  });
}

/** `beforeEach(() => algo)` o `beforeAll(async () => algo)`: un hook de antes que devuelve un valor. */
const RETURNING_HOOK = /\b(beforeEach|beforeAll)\((async\s+)?\([^)]*\)\s*=>(?!\s*\{)/;

describe("hooks de las pruebas", () => {
  it("la regla reconoce un hook que devuelve un valor y deja pasar uno con llaves", () => {
    expect(RETURNING_HOOK.test("beforeEach(() => mocks.getSession.mockReset());")).toBe(true);
    expect(RETURNING_HOOK.test("beforeAll(async () => await setup());")).toBe(true);
    expect(RETURNING_HOOK.test("beforeEach(({ task }) => log(task));")).toBe(true);
    expect(RETURNING_HOOK.test("beforeEach(() => {")).toBe(false);
    expect(RETURNING_HOOK.test("beforeAll(async () => {")).toBe(false);
    // En varias líneas, el cuerpo de expresión empieza en la siguiente: también cuenta.
    expect(RETURNING_HOOK.test("beforeEach(() =>")).toBe(true);
    // Lo que devuelve un hook de después, Vitest lo ignora.
    expect(RETURNING_HOOK.test("afterEach(() => vi.unstubAllEnvs());")).toBe(false);
  });

  it("ningún beforeEach ni beforeAll devuelve un valor (Vitest lo llamaría como limpieza)", () => {
    const offenders = DIRS.flatMap((dir) => testFiles(join(ROOT, dir)))
      // Este archivo trae los ejemplos de la regla.
      .filter((file) => file !== __filename)
      .flatMap((file) =>
        read(file)
          .split("\n")
          .map((line, i) => ({ line, number: i + 1 }))
          .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && RETURNING_HOOK.test(line))
          .map(({ number }) => `${relative(ROOT, file)}:${number}`),
      );
    expect(offenders).toEqual([]);
  });
});

function read(file: string) {
  return readFileSync(file, "utf8");
}
