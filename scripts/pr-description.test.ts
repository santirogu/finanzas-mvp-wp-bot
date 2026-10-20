import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseSections,
  runCli,
  stripHtmlComments,
  validateDescription,
} from "./pr-description.mjs";

const valid = `## Why
Desplegar en cada merge gastaba builds en cambios que no tocan la app.

## What
- Job "Detectar cambios de la app".

## How
Compara con el último despliegue exitoso. Probado con 17 pruebas.

## Additional Notes
Usar *Run workflow* tras cambiar variables en Vercel.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;

describe("validateDescription", () => {
  it("acepta una descripción completa", () => {
    expect(validateDescription(valid)).toEqual({ ok: true });
  });

  it("Additional Notes es opcional", () => {
    expect(validateDescription(valid.replace(/## Additional Notes[\s\S]*$/, ""))).toEqual({
      ok: true,
    });
  });

  it("acepta saltos de línea de Windows y mayúsculas distintas en los encabezados", () => {
    const body = valid
      .replace(/\n/g, "\r\n")
      .replace("## Why", "## WHY")
      .replace("## How", "## how");
    expect(validateDescription(body)).toEqual({ ok: true });
  });

  it("rechaza la plantilla sin llenar (solo comentarios)", () => {
    const template = readFileSync(".github/pull_request_template.md", "utf8");
    const result = validateDescription(template);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      'La sección "## Why" está vacía o es demasiado corta.',
      'La sección "## What" está vacía o es demasiado corta.',
      'La sección "## How" está vacía o es demasiado corta.',
    ]);
  });

  it("rechaza secciones faltantes", () => {
    const result = validateDescription("## Why\nPorque hace falta este cambio.");
    expect(!result.ok && result.errors).toEqual([
      'Falta la sección "## What".',
      'Falta la sección "## How".',
    ]);
  });

  it.each(["N/A", "-", "  ", "TODO"])("rechaza una sección con solo %j", (content) => {
    const result = validateDescription(valid.replace(/## How\n[^\n]+/, `## How\n${content}`));
    expect(!result.ok && result.errors).toEqual([
      'La sección "## How" está vacía o es demasiado corta.',
    ]);
  });

  it("rechaza una descripción vacía o ausente", () => {
    expect(validateDescription("").ok).toBe(false);
    expect(validateDescription(null as unknown as string).ok).toBe(false);
  });

  it("no confunde un ### subtítulo con una sección", () => {
    const body =
      "## Why\nPorque sí, de verdad.\n### What\nno cuenta\n## How\nAsí se hizo y se probó.";
    expect(validateDescription(body)).toEqual({
      ok: false,
      errors: ['Falta la sección "## What".'],
    });
  });
});

describe("parseSections", () => {
  it("cada sección con sus líneas, separadas por saltos de línea (sin las vacías de los extremos)", () => {
    expect(parseSections("## What\n\n- a\n- b\n\n").get("what")).toBe("- a\n- b");
  });

  it("el título sin los espacios ni los # de los extremos, en minúsculas", () => {
    expect([...parseSections("##   Why   ##\nUno\n##  Additional Notes \nDos").keys()]).toEqual(["why", "additional notes"]);
  });

  it("ignora los comentarios HTML de la plantilla", () => {
    expect(parseSections("## Why\n<!-- pista -->\nReal").get("why")).toBe("Real");
  });
});

describe("stripHtmlComments", () => {
  it("quita comentarios anidados que una sola pasada dejaría armados", () => {
    expect(stripHtmlComments("a<!<!-- -->-- oculto -->b")).toBe("ab");
  });

  it("quita varios comentarios y conserva el texto entre ellos", () => {
    expect(stripHtmlComments("<!-- uno -->visible<!-- dos\nlíneas -->")).toBe("visible");
  });

  it("deja el texto sin comentarios tal cual", () => {
    expect(stripHtmlComments("## Why\nPorque sí")).toBe("## Why\nPorque sí");
  });
});

describe("validateDescription · límites", () => {
  const withHow = (how: string) =>
    `## Why\nPorque hace falta el cambio.\n## What\nUna lista de cambios.\n## How\n${how}`;

  it("acepta exactamente el mínimo de 10 caracteres (sin contar espacios)", () => {
    expect(validateDescription(withHow("abcde fghij"))).toEqual({ ok: true });
    expect(validateDescription(withHow("abcde fghi")).ok).toBe(false);
  });

  it("si una sección aparece dos veces, suma su contenido", () => {
    const body =
      "## Why\nPorque sí,\n## What\nUna lista de cambios.\n## How\nAsí se hizo.\n## Why\nde verdad.";
    expect(validateDescription(body)).toEqual({ ok: true });
  });
});

describe("runCli", () => {
  function run(body: string) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runCli(body, {
      log: (l: string) => out.push(l),
      error: (l: string) => err.push(l),
    });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("confirma una descripción válida", () => {
    expect(run(valid)).toEqual({
      code: 0,
      out: "✓ La descripción del PR sigue la plantilla (Why / What / How).",
      err: "",
    });
  });

  it("explica qué falta y cómo corregirlo", () => {
    const result = run("## Why\nPorque hace falta este cambio.");
    expect(result.code).toBe(1);
    expect(result.err).toContain("✗ La descripción del PR no sigue la plantilla:");
    expect(result.err).toContain('  • Falta la sección "## What".');
    expect(result.err).toContain("## How  — cómo se resolvió y cómo se probó");
    expect(result.err).toContain(
      "Edita la descripción del PR: el check se vuelve a ejecutar solo.",
    );
  });
});
