#!/usr/bin/env node
// Valida que la descripción de un PR siga la plantilla (.github/pull_request_template.md):
// secciones "## Why", "## What" y "## How" con contenido real; "## Additional Notes" es opcional.
//
// Uso: printf '%s' "$PR_BODY" | node scripts/pr-description.mjs
// Sin dependencias: corre en el CI sin instalar paquetes.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_SECTIONS = ["Why", "What", "How"];
export const OPTIONAL_SECTIONS = ["Additional Notes"];
// Por debajo de esto se asume que la sección quedó vacía o con un "N/A".
export const MIN_CONTENT_LENGTH = 10;

/** Separa el markdown en secciones de nivel 2 ("## Título") con su contenido. */
export function parseSections(body) {
  const text = (body ?? "").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  const sections = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join("\n").trim()]));
}

/** @returns {{ ok: true } | { ok: false, errors: string[] }} */
export function validateDescription(body) {
  const sections = parseSections(body);
  const errors = [];
  for (const name of REQUIRED_SECTIONS) {
    const content = sections.get(name.toLowerCase());
    if (content === undefined) {
      errors.push(`Falta la sección "## ${name}".`);
    } else if (content.replace(/\s+/g, "").length < MIN_CONTENT_LENGTH) {
      errors.push(`La sección "## ${name}" está vacía o es demasiado corta.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

function main() {
  const body = readFileSync(0, "utf8");
  const result = validateDescription(body);
  if (result.ok) {
    console.log("✓ La descripción del PR sigue la plantilla (Why / What / How).");
    return 0;
  }
  console.error("✗ La descripción del PR no sigue la plantilla:\n");
  for (const error of result.errors) console.error(`  • ${error}`);
  console.error(
    `\nUsa las secciones de .github/pull_request_template.md:\n  ## Why  — por qué hace falta el cambio\n  ## What — qué cambia\n  ## How  — cómo se resolvió y cómo se probó\n  ## Additional Notes — opcional\n\nEdita la descripción del PR: el check se vuelve a ejecutar solo.`,
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
