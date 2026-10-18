import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// El contraste de los colores de globals.css que axe no revisa: el borde de los campos y sus estados
// (con el foco, con un error) contra lo que los rodea, 3:1 (WCAG 1.4.11), y los avisos emergentes
// (aparecen unos segundos: axe casi nunca los alcanza). El resto del texto lo revisa axe en las E2E,
// en modo claro y oscuro.

const css = readFileSync(path.join(__dirname, "app/globals.css"), "utf8");

/** Los colores de un bloque `:root { … }`. */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
}

// El modo oscuro está dos veces: el del sistema (media query) y el elegido en Mi cuenta
// (data-theme="dark"). Tienen que ser iguales.
const darkFromSystem = css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)![1];
const darkChosen = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)![1];

const MODES = {
  claro: tokens(css.match(/^:root\s*\{([^}]*)\}/m)![1]),
  oscuro: tokens(darkChosen),
};

/** Luminancia relativa de un color #rrggbb (WCAG 2.2). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("contraste (WCAG)", () => {
  it("calcula como la WCAG", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#ffffff", "#777777")).toBe(contrast("#777777", "#ffffff"));
  });

  for (const [mode, colors] of Object.entries(MODES)) {
    describe(`modo ${mode}`, () => {
      // Un campo va sobre una tarjeta (surface) o sobre el fondo de la página (background), y su
      // propio fondo es surface o background (solo lectura).
      it.each([
        ["control", "surface"],
        ["control", "background"],
        ["brand", "surface"],
        ["danger", "surface"],
      ])("--%s contra --%s: al menos 3:1", (border, around) => {
        expect(colors[border], `--${border}`).toBeDefined();
        expect(contrast(colors[border], colors[around])).toBeGreaterThanOrEqual(3);
      });
    });
  }

  // Los avisos emergentes: el texto (y el botón "Deshacer", en el color fuerte) sobre su fondo suave,
  // 4,5:1; el ícono y la barrita del tiempo también lo cumplen.
  for (const [mode, colors] of Object.entries(MODES)) {
    it.each([
      ["foreground", "success-surface"],
      ["success", "success-surface"],
      ["foreground", "danger-surface"],
      ["danger", "danger-surface"],
    ])(`modo ${mode}: --%s sobre --%s, al menos 4,5:1`, (text, surface) => {
      expect(colors[surface], `--${surface}`).toBeDefined();
      expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
    });
  }

  // La dona de "Gastos por categoría": cada tajada se distingue de la tarjeta (3:1, WCAG 1.4.11).
  for (const [mode, colors] of Object.entries(MODES)) {
    it.each(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-rest"])(
      `modo ${mode}: --%s contra --surface, al menos 3:1`,
      (token) => {
        expect(colors[token], `--${token}`).toBeDefined();
        expect(contrast(colors[token], colors.surface)).toBeGreaterThanOrEqual(3);
      },
    );
  }

  it("el modo oscuro elegido en Mi cuenta es igual al del sistema, y define los mismos colores que el claro", () => {
    const normalize = (block: string) => block.split(";").map((line) => line.trim()).filter(Boolean);
    expect(normalize(darkChosen)).toEqual(normalize(darkFromSystem));
    expect(Object.keys(MODES.oscuro).sort()).toEqual(Object.keys(MODES.claro).sort());
  });

  it("los campos usan el borde de los controles, no el de los divisores", () => {
    const input = css.match(/\.input\s*\{([^}]*)\}/)![1];
    expect(input).toMatch(/\bborder-control\b/);
    expect(input).not.toMatch(/\bborder-border\b/);
  });
});
