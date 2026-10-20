#!/usr/bin/env node
// Valida que la descripción de un PR siga la plantilla (.github/pull_request_template.md):
// secciones "## Why", "## What" y "## How" con contenido real; "## Additional Notes" es opcional.
//
// Uso: printf '%s' "$PR_BODY" | node scripts/pr-description.mjs
// Sin dependencias: corre en el CI sin instalar paquetes.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// "## Additional Notes" es opcional: no se valida.
export const REQUIRED_SECTIONS = ["Why", "What", "How"];
// Por debajo de esto se asume que la sección quedó vacía o con un "N/A".
export const MIN_CONTENT_LENGTH = 10;

/**
 * Quita los comentarios HTML de la plantilla. Se repite hasta que no quede ninguno: una sola
 * pasada deja restos con entradas como "<!<!-- -->-- x -->", que forman un comentario nuevo.
 */
export function stripHtmlComments(text) {
  let previous;
  do {
    previous = text;
    text = text.replace(/<!--[\s\S]*?-->/g, "");
  } while (text !== previous);
  return text;
}

/** Separa el markdown en secciones de nivel 2 ("## Título") con su contenido. */
export function parseSections(body) {
  // Stryker disable next-line StringLiteral: un texto sin "##" da las mismas secciones que uno vacío
  const text = stripHtmlComments((body ?? "").replace(/\r\n/g, "\n"));
  const sections = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      // Sin espacios alrededor: los deja afuera la expresión (\s+ al comienzo, \s* al final).
      current = heading[1].toLowerCase();
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
    // Stryker disable next-line Regex: con "g", quitar los espacios de a uno o de a varios da lo mismo
    } else if (content.replace(/\s+/g, "").length < MIN_CONTENT_LENGTH) {
      errors.push(`La sección "## ${name}" está vacía o es demasiado corta.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Valida desde la línea de comandos y devuelve el código de salida. */
export function runCli(body, { log = console.log, error = console.error } = {}) {
  const result = validateDescription(body);
  if (result.ok) {
    log("✓ La descripción del PR sigue la plantilla (Why / What / How).");
    return 0;
  }
  error("✗ La descripción del PR no sigue la plantilla:\n");
  for (const message of result.errors) error(`  • ${message}`);
  error(
    `\nUsa las secciones de .github/pull_request_template.md:\n  ## Why  — por qué hace falta el cambio\n  ## What — qué cambia\n  ## How  — cómo se resolvió y cómo se probó\n  ## Additional Notes — opcional\n\nEdita la descripción del PR: el check se vuelve a ejecutar solo.`,
  );
  return 1;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Stryker disable next-line all
  process.exit(runCli(readFileSync(0, "utf8")));
}
