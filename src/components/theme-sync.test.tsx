import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY, applySavedTheme } from "@/lib/theme";
import { ThemeSync } from "./theme-sync";

// Si el layout raíz se vuelve a montar sin recargar (otro idioma), React le quita data-theme a <html>:
// ThemeSync lo vuelve a poner. El caso completo, en e2e/idioma-ingles.spec.ts.

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
});

describe("applySavedTheme", () => {
  it("pone el tema guardado; sin tema (o con uno raro), quita el atributo: el del sistema", () => {
    localStorage.setItem(THEME_KEY, "light");
    applySavedTheme();
    expect(root.dataset.theme).toBe("light");
    localStorage.setItem(THEME_KEY, "dark");
    applySavedTheme();
    expect(root.dataset.theme).toBe("dark");
    localStorage.setItem(THEME_KEY, "<script>");
    applySavedTheme();
    expect(root.dataset.theme).toBeUndefined();
  });
});

describe("ThemeSync", () => {
  it("al montarse, vuelve a poner el tema que React le quitó a <html>", () => {
    localStorage.setItem(THEME_KEY, "light");
    // Como queda <html> después de que React lo vuelve a montar: sin data-theme.
    delete root.dataset.theme;
    const { container } = render(<ThemeSync />);
    expect(root.dataset.theme).toBe("light");
    expect(container).toBeEmptyDOMElement();
  });

  it("con Sistema, no pone ninguno", () => {
    root.dataset.theme = "dark";
    render(<ThemeSync />);
    expect(root.dataset.theme).toBeUndefined();
  });
});
