import { describe, expect, it } from "vitest";
import { score, summarize } from "./mutation-summary.mjs";

const mutants = (statuses: string[]) => statuses.map((status) => ({ status }));

describe("score", () => {
  it("cuenta Killed y Timeout como detectados; Survived y NoCoverage como no detectados", () => {
    expect(score(mutants(["Killed", "Timeout", "Survived", "NoCoverage"]))).toEqual({
      detected: 2,
      undetected: 2,
      valid: 4,
      percent: 50,
    });
  });

  it("ignora errores de compilación, de ejecución y mutantes ignorados", () => {
    expect(score(mutants(["Killed", "CompileError", "RuntimeError", "Ignored"])).percent).toBe(100);
  });

  it("sin mutantes válidos el puntaje es 100 %", () => {
    expect(score([]).percent).toBe(100);
  });
});

describe("summarize", () => {
  it("muestra el total y los archivos de peor a mejor", () => {
    const markdown = summarize({
      files: {
        "src/lib/money.ts": { mutants: mutants(["Killed", "Killed", "Killed", "Survived"]) },
        "src/lib/dates.ts": { mutants: mutants(["Killed", "Survived"]) },
      },
    });

    expect(markdown).toContain("### Mutation testing: 66.7 %");
    expect(markdown).toContain("4 de 6 mutantes detectados por las pruebas; 2 sobrevivieron.");
    expect(markdown.indexOf("dates.ts")).toBeLessThan(markdown.indexOf("money.ts"));
    expect(markdown).toContain("| `src/lib/money.ts` | 75.0 % | 1 |");
  });
});
