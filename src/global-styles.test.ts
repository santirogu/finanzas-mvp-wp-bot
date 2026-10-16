import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reglas de globals.css que las E2E no pueden ver, porque corren en Chromium: lo que Safari dibuja
// distinto. La auditoría de diseño (WebKit) las revisa en pantalla; aquí, que no se pierdan.

const css = readFileSync(path.join(__dirname, "app/globals.css"), "utf8");
/** El contenido `{ … }` de una regla, buscada por su selector exacto (como texto, sin armar una regex). */
function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

describe("estilos para Safari", () => {
  it("el <select> no usa la apariencia del sistema (Safari en Mac no le aplicaría el borde ni el alto)", () => {
    const select = rule("select.input");
    expect(select).toMatch(/\bappearance-none\b/);
    // Sin la apariencia del sistema no hay flecha: la dibuja la imagen de fondo.
    expect(select).toMatch(/background-image:\s*var\(--select-arrow\)/);
    // Claro, oscuro del sistema y oscuro elegido en Mi cuenta.
    expect(css.match(/--select-arrow:/g)).toHaveLength(3);
  });

  it("el campo de fecha tampoco (en el iPhone no respetaría el ancho de su columna)", () => {
    expect(rule('input[type="date"].input')).toMatch(/\bappearance-none\b/);
  });
});

describe("modo oscuro", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
  const sources = walk(__dirname).filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"));

  it("ningún componente usa la variante dark: de Tailwind (solo mira el sistema, no lo elegido en Mi cuenta)", () => {
    const offenders = sources.filter((file) => /\bdark:[a-z]/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => path.relative(__dirname, file))).toEqual([]);
  });
});
