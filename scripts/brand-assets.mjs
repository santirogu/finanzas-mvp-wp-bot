#!/usr/bin/env node
// Genera los íconos de la marca y la imagen para compartir, a partir del dibujo del logo
// (src/lib/brand-mark.json). Se corre a mano cuando cambia el logo o el eslogan, y los archivos que deja
// se suben al repo:
//
//   src/app/favicon.ico          16, 32 y 48 px (navegadores viejos)
//   src/app/icon.svg             el ícono de la pestaña
//   src/app/apple-icon.png       180 px, sin esquinas redondeadas (iOS las pone)
//   src/app/opengraph-image.png  1200 × 630, la vista previa al compartir el enlace (WhatsApp, redes)
//   public/marca/icono-*.png     192 y 512 px, y el "maskable" para Android (manifest.ts)
//   public/app-icon-1024.png     el ícono de la app de Meta (se sube a mano en Meta for Developers)
//
// Uso: node scripts/brand-assets.mjs (necesita Chromium de Playwright: pnpm exec playwright install chromium)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mark from "../src/lib/brand-mark.json" with { type: "json" };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * El ícono en SVG. `rounded`: con las esquinas redondeadas y transparentes (la pestaña, el manifest);
 * sin ellas, el cuadro entero (iOS, Android y Meta recortan su propia forma). Sin `size`, sin tamaño fijo.
 *
 * @param {{ rounded?: boolean, size?: number }} [options]
 */
export function markSvg({ rounded = true, size } = {}) {
  const dimensions = size ? ` width="${size}" height="${size}"` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}"${dimensions}>`,
    `<rect width="32" height="32"${rounded ? ` rx="${mark.radius}"` : ""} fill="${mark.brand}"/>`,
    `<path d="${mark.bubble}" fill="${mark.brandForeground}"/>`,
    `<path d="${mark.check}" fill="none" stroke="${mark.brand}" stroke-width="${mark.checkWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    "</svg>",
  ].join("");
}

/**
 * Un .ico con PNG adentro (lo aceptan todos los navegadores desde Windows Vista): la cabecera, una
 * entrada de 16 bytes por imagen y, después, los PNG.
 */
export function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícono
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // ancho (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // alto
    entry.writeUInt8(0, 2); // sin paleta
    entry.writeUInt8(0, 3); // reservado
    entry.writeUInt16LE(1, 4); // planos de color
    entry.writeUInt16LE(32, 6); // bits por píxel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** La imagen para compartir (1200 × 630): el logo, el eslogan y una conversación con el bot. */
export function shareImageHtml({ fontsDir, name, heading, body, message, reply }) {
  const font = (file, weight) => `@font-face{font-family:Geist;src:url(${pathToFileURL(join(fontsDir, file)).href});font-weight:${weight}}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${font("Geist-Regular.ttf", 400)}${font("Geist-SemiBold.ttf", 600)}
*{box-sizing:border-box}
body{margin:0;width:1200px;height:630px;background:#f6f7f9;color:#14171c;font-family:Geist,sans-serif;display:flex;align-items:center;gap:64px;padding:0 88px}
.left{flex:1;min-width:0}
.brand{display:flex;align-items:center;gap:18px;font-size:56px;font-weight:600;letter-spacing:-0.02em}
h1{margin:44px 0 0;font-size:54px;line-height:1.08;font-weight:600;letter-spacing:-0.025em}
p{margin:22px 0 0;font-size:27px;line-height:1.35;color:#5f6672}
.chat{width:420px;background:#fff;border:1px solid #e3e6eb;border-radius:28px;padding:26px;display:flex;flex-direction:column;gap:14px}
.bubble{max-width:90%;padding:14px 18px;border-radius:20px;font-size:24px;line-height:1.35}
.me{align-self:flex-end;background:#dcefec;border-bottom-right-radius:6px}
.bot{align-self:flex-start;background:#f1f3f6;border-bottom-left-radius:6px}
</style></head><body>
<div class="left">
<div class="brand">${markSvg({ size: 72 })}${escape(name)}</div>
<h1>${escape(heading)}</h1>
<p>${escape(body)}</p>
</div>
<div class="chat">
<div class="bubble me">${escape(message)}</div>
<div class="bubble bot">${reply}</div>
</div>
</body></html>`;
}

async function main() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const write = (file, data) => {
    const path = join(ROOT, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    console.log(`  ${file}`);
  };
  /** Un PNG del ícono, del tamaño pedido. Con esquinas redondeadas, el fondo queda transparente. */
  const png = async (size, rounded) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${markSvg({ rounded, size })}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };

  console.log("Íconos de la marca:");
  write("src/app/icon.svg", `${markSvg()}\n`);
  // Uno por uno: es la misma página.
  const favicons = [];
  for (const size of [16, 32, 48]) favicons.push({ size, png: await png(size, true) });
  write("src/app/favicon.ico", packIco(favicons));
  write("src/app/apple-icon.png", await png(180, false));
  write("public/marca/icono-192.png", await png(192, true));
  write("public/marca/icono-512.png", await png(512, true));
  write("public/marca/icono-maskable-512.png", await png(512, false));
  write("public/app-icon-1024.png", await png(1024, false));

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(
    shareImageHtml({
      fontsDir: join(ROOT, "src/modules/reports/pdf/fonts"),
      name: "Anotado",
      heading: "Escribe tu gasto por WhatsApp. Queda anotado.",
      body: "Tus ingresos y egresos con un mensaje, y tu mes claro en la web.",
      message: "gasté 25 mil en almuerzo",
      reply: "✅ Anotado: <b>Almuerzo</b> — $25.000,00 (Alimentación)",
    }),
  );
  await page.evaluate(() => document.fonts.ready);
  write("src/app/opengraph-image.png", await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
  await browser.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
