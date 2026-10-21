import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import mark from "../src/lib/brand-mark.json";
import { markSvg, packIco, shareImageHtml } from "./brand-assets.mjs";

const ROOT = path.join(__dirname, "..");

describe("markSvg", () => {
  it("el ícono con el dibujo y los colores de brand-mark.json", () => {
    const svg = markSvg();
    expect(svg).toContain(`viewBox="${mark.viewBox}"`);
    expect(svg).toContain(`rx="${mark.radius}"`);
    expect(svg).toContain(`d="${mark.bubble}" fill="${mark.brandForeground}"`);
    expect(svg).toContain(`d="${mark.check}" fill="none" stroke="${mark.brand}" stroke-width="${mark.checkWidth}"`);
    // Sin tamaño, se adapta a donde lo pongan.
    expect(svg.match(/^<svg[^>]*>/)?.[0]).not.toContain("width");
  });

  it("sin esquinas redondeadas (iOS, Android y Meta recortan la suya) y con un tamaño", () => {
    const svg = markSvg({ rounded: false, size: 180 });
    expect(svg).not.toContain("rx=");
    expect(svg).toContain('width="180" height="180"');
  });

  it("los colores son los de la marca en modo claro (globals.css)", () => {
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    expect(css).toContain(`--brand: ${mark.brand};`);
    expect(css).toContain(`--brand-foreground: ${mark.brandForeground};`);
  });

  it("el icon.svg del repo está al día con brand-mark.json (si cambia el dibujo: node scripts/brand-assets.mjs)", () => {
    expect(readFileSync(path.join(ROOT, "src/app/icon.svg"), "utf8")).toBe(`${markSvg()}\n`);
  });
});

describe("packIco", () => {
  it("la cabecera, una entrada por imagen con su tamaño y su lugar, y los PNG después", () => {
    const a = Buffer.from("png-de-16");
    const b = Buffer.from("png-de-256-bytes");
    const ico = packIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    // Primera entrada: 16 px, sus bytes, y empieza después de la cabecera (6) y las dos entradas (32).
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(7)).toBe(16);
    expect(ico.readUInt16LE(6 + 6)).toBe(32);
    expect(ico.readUInt32LE(6 + 8)).toBe(a.length);
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    // 256 px se escribe como 0, y la segunda imagen va después de la primera.
    expect(ico.readUInt8(22)).toBe(0);
    expect(ico.readUInt32LE(22 + 12)).toBe(38 + a.length);
    expect(ico.subarray(38).toString()).toBe("png-de-16png-de-256-bytes");
  });

  it("el favicon.ico del repo trae 16, 32 y 48 px", () => {
    const ico = readFileSync(path.join(ROOT, "src/app/favicon.ico"));
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
  });
});

describe("shareImageHtml", () => {
  it("el logo, el eslogan y la conversación, con la fuente Geist y el texto escapado", () => {
    const html = shareImageHtml({
      fontsDir: "/fuentes",
      name: "Anotado",
      heading: "Escribe <tu> gasto",
      body: "Ingresos & egresos",
      message: "gasté 25 mil",
      reply: "✅ Anotado: <b>Almuerzo</b>",
    });
    expect(html).toContain("file:///fuentes/Geist-SemiBold.ttf");
    expect(html).toContain(">Anotado</div>");
    expect(html).toContain("<h1>Escribe &lt;tu&gt; gasto</h1>");
    expect(html).toContain("<p>Ingresos &amp; egresos</p>");
    // La respuesta va con su negrita (HTML a propósito).
    expect(html).toContain("✅ Anotado: <b>Almuerzo</b>");
  });
});
