import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_COLORS } from "./colors";

// El PDF no lee CSS: sus colores están copiados del modo claro de globals.css. Si cambia un color de la
// app, esta prueba pide cambiarlo también en el PDF.
const css = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8");
const light = Object.fromEntries(
  [...css.match(/^:root\s*\{([^}]*)\}/m)![1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()]),
);

describe("colores del PDF", () => {
  it("son los del modo claro de la app", () => {
    const { chart, chartRest, ...named } = PDF_COLORS;
    for (const [name, value] of Object.entries(named)) expect(value, name).toBe(light[name]);
    chart.forEach((value, i) => expect(value, `chart-${i + 1}`).toBe(light[`chart-${i + 1}`]));
    expect(chartRest).toBe(light["chart-rest"]);
  });
});
