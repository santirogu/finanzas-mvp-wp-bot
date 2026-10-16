import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// En el CI las E2E van partidas en varios jobs (.github/workflows/ci.yml → e2e-parte), cada uno con
// sus proyectos de Playwright y, a veces, una porción (--shard). Si un proyecto nuevo de
// playwright.config.ts no está en ninguna parte, o falta una porción, esas pruebas dejarían de correr
// sin que nada falle: esta prueba lo impide.

const read = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");
const projectsBlock = read("playwright.config.ts").match(/\n {2}projects: \[\n([\s\S]*?)\n {2}\],\n/)?.[1] ?? "";
const projects = [...projectsBlock.matchAll(/\bname: "([^"]+)"/g)].map((m) => m[1]);
const ci = read(".github/workflows/ci.yml");
const parts = [...ci.matchAll(/^ +- parte: (\d+)\n +pruebas: (.+)$/gm)].map(([, number, args]) => ({
  number: Number(number),
  projects: [...args.matchAll(/--project=(\S+)/g)].map((m) => m[1]),
  shard: args.match(/--shard=(\d+)\/(\d+)/)?.slice(1).map(Number) ?? null,
}));

describe("las E2E del CI", () => {
  it("lee los proyectos y las partes", () => {
    expect(projects).toEqual(["escritorio", "celular", "tableta"]);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((p) => p.number)).toEqual(parts.map((_, i) => i + 1));
  });

  it("cada proyecto de playwright.config.ts corre en alguna parte, y solo esos", () => {
    expect(new Set(parts.flatMap((p) => p.projects))).toEqual(new Set(projects));
    for (const part of parts) expect(part.projects.length, `parte ${part.number}`).toBeGreaterThan(0);
  });

  it("un proyecto va entero en una parte o en todas sus porciones, sin repetirse", () => {
    for (const project of projects) {
      const withIt = parts.filter((p) => p.projects.includes(project));
      if (withIt.length === 1 && withIt[0].shard === null) continue;
      // Partido: cada parte tiene solo ese proyecto y, entre todas, las porciones 1…n.
      expect(withIt.every((p) => p.projects.length === 1 && p.shard), project).toBe(true);
      const total = withIt[0].shard![1];
      expect(withIt.map((p) => p.shard), project).toEqual(Array.from({ length: total }, (_, i) => [i + 1, total]));
    }
  });

  it("el check obligatorio junta todas las partes", () => {
    expect(ci).toMatch(/\n {2}e2e:\n {4}name: E2E y accesibilidad\n {4}needs: \[e2e-cambios, e2e-parte\]\n {4}if: always\(\)\n/);
    expect(ci).toContain('test "$DETECCION" = "success" && test "$RESULTADO" = "success"');
  });

  // Las partes se saltan solo si scripts/e2e-needed.mjs dijo que el PR no las necesita; el check
  // obligatorio acepta "saltadas" solo en ese caso, y fuera de un PR (main) corren siempre.
  it("las partes se saltan solo cuando la detección lo decide, y solo en un PR", () => {
    expect(ci).toMatch(/\n {2}e2e-parte:\n {4}name: .+\n {4}needs: e2e-cambios\n {4}if: needs\.e2e-cambios\.outputs\.e2e == 'true'\n/);
    expect(ci).toContain(
      'if [ "$DETECCION" = "success" ] && [ "$NECESARIAS" = "false" ] && [ "$RESULTADO" = "skipped" ]; then',
    );
    expect(ci).toMatch(/if \[ "\$GITHUB_EVENT_NAME" != "pull_request" \]; then\n.+\n +echo "e2e=true" >> "\$GITHUB_OUTPUT"/);
  });
});
