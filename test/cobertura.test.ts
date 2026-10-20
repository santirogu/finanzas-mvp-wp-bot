import { globSync, readFileSync } from "node:fs";
import path, { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";

// Los componentes de src/app que mide la cobertura están en una lista escrita a mano
// (vitest.config.mts → coverage.include). Si un componente de cliente nuevo queda fuera, su prueba corre
// pero su cobertura no cuenta para el umbral, y puede bajar sin que nadie lo note (la auditoría de
// pruebas encontró 12 así). Esta prueba lo impide: cada uno se mide o se excluye a propósito.

const root = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const config = read("vitest.config.mts");
const coverage = config.slice(config.indexOf("coverage: {"), config.indexOf("projects: ["));
const list = (key: string) => [...(coverage.match(new RegExp(`\\b${key}: \\[([\\s\\S]*?)\\n {6}\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const include = list("include");
const exclude = list("exclude");

const clientComponents = globSync("src/{app,components}/**/*.tsx", { cwd: root })
  .filter((file) => !file.endsWith(".test.tsx") && /^["']use client["']/.test(read(file)))
  .sort();

describe("la cobertura de los componentes de cliente", () => {
  it("lee la configuración y los componentes", () => {
    expect(include).toContain("src/components/**");
    expect(exclude).toContain("src/app/(app)/simulador/chat.tsx");
    expect(clientComponents.length).toBeGreaterThan(20);
  });

  it.each(clientComponents)("%s se mide (o se excluye a propósito)", (file) => {
    const measured = include.some((pattern) => matchesGlob(file, pattern)) && !exclude.some((pattern) => matchesGlob(file, pattern));
    expect(measured || exclude.includes(file), `agrégalo a coverage.include de vitest.config.mts (o, con su porqué, a exclude)`).toBe(true);
  });
});
