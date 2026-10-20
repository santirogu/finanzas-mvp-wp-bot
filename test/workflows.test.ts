import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Los pasos de los workflows que pasan la salida de un script por otro comando ("node … | tee") tienen
// que usar "set -o pipefail": si no, el resultado del paso es el del último comando (tee, que siempre
// sale bien) y una falla del script pasa en silencio. Así se saltaba sin aviso, con el CI en verde, la
// decisión de desplegar si scripts/deploy-needed.mjs se caía.

const root = path.join(__dirname, "..");

/** El script de cada paso `run:` de un workflow (una línea o un bloque `run: |`). */
function runBlocks(file: string): { line: number; script: string }[] {
  const lines = readFileSync(path.join(root, file), "utf8").split("\n");
  const blocks: { line: number; script: string }[] = [];
  lines.forEach((text, i) => {
    const match = /^(\s*)(?:- )?run: (.*)$/.exec(text);
    if (!match) return;
    if (match[2].trim() !== "|") return void blocks.push({ line: i + 1, script: match[2] });
    const indent = match[1].length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && (lines[j].trim() === "" || lines[j].search(/\S/) > indent); j++) body.push(lines[j]);
    blocks.push({ line: i + 1, script: body.join("\n") });
  });
  return blocks;
}

const workflows = globSync(".github/workflows/*.yml", { cwd: root }).sort();
const piped = workflows.flatMap((file) =>
  runBlocks(file)
    // Un "|" solo (una tubería); "||" es un "o" lógico y no cuenta.
    .filter(({ script }) => /node scripts\/[^\n|]*\|(?!\|)/.test(script))
    .map(({ line, script }) => ({ where: `${file}:${line}`, script })),
);

describe("los workflows", () => {
  it("encuentra los pasos que pasan un script por otro comando", () => {
    expect(piped.map((step) => step.where)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\.github\/workflows\/ci\.yml:/), expect.stringMatching(/^\.github\/workflows\/mutation\.yml:/)]),
    );
  });

  it.each(piped.map((step) => [step.where, step.script]))("%s usa set -o pipefail", (_, script) => {
    expect(script).toMatch(/set -o pipefail/);
  });
});
