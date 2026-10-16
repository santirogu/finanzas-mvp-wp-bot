import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reglas de globals.css que las E2E no pueden ver, porque corren en Chromium: lo que Safari dibuja
// distinto. La auditoría de diseño (WebKit) las revisa en pantalla; aquí, que no se pierdan.

const css = readFileSync(path.join(__dirname, "app/globals.css"), "utf8");
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("estilos para Safari", () => {
  it("el <select> no usa la apariencia del sistema (Safari en Mac no le aplicaría el borde ni el alto)", () => {
    const select = rule("select.input");
    expect(select).toMatch(/\bappearance-none\b/);
    // Sin la apariencia del sistema no hay flecha: la dibuja la imagen de fondo.
    expect(select).toMatch(/background-image:\s*var\(--select-arrow\)/);
    expect(css.match(/--select-arrow:/g)).toHaveLength(2);
  });

  it("el campo de fecha tampoco (en el iPhone no respetaría el ancho de su columna)", () => {
    expect(rule('input[type="date"].input')).toMatch(/\bappearance-none\b/);
  });
});
