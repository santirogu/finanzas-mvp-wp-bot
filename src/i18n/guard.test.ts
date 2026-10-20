import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Con la reescritura del proxy (src/proxy.ts), usePathname puede dar /es/ayuda en el servidor y /ayuda en el
// navegador: marcaba mal la pestaña o volvía a una dirección con el idioma. La ruta se lee con
// useAppPathname (src/i18n/navigation.ts), el único lugar que usa usePathname.

const ROOT = join(__dirname, "../..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const sources = walk(join(ROOT, "src")).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

describe("la ruta actual", () => {
  it("revisa los archivos de src", () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it("solo src/i18n/navigation.ts usa usePathname: los demás, useAppPathname", () => {
    // Lo importa o lo llama (los comentarios que lo nombran no cuentan).
    const uses = /import\s*\{[^}]*\busePathname\b|\busePathname\s*\(/;
    const users = sources.filter((file) => uses.test(readFileSync(file, "utf8"))).map((file) => relative(ROOT, file));
    expect(users).toEqual(["src/i18n/navigation.ts"]);
  });
});
