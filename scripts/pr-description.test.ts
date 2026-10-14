import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSections, stripHtmlComments, validateDescription } from "./pr-description.mjs";

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
