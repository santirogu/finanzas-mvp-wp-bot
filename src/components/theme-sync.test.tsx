import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, applySavedTheme } from "@/lib/theme";

const navigation = vi.hoisted(() => ({ pathname: "/es/login" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { ThemeSync } = await import("./theme-sync");

// Si el layout raíz se vuelve a montar sin recargar (otro idioma), React le quita data-theme a <html>:
// ThemeSync lo vuelve a poner. El caso completo, en e2e/idioma-ingles.spec.ts.

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  document.cookie = `${THEME_KEY}=; Max-Age=0; Path=/`;
  delete root.dataset.theme;
  navigation.pathname = "/es/login";
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

  it("en cada cambio de página, la del navegador: al entrar, la cookie que puso la cuenta", () => {
    const { rerender } = render(<ThemeSync />);
    expect(root.dataset.theme).toBeUndefined();
    // El inicio de sesión le pone la cookie de la cuenta, y el login pasa al Resumen sin recargar.
    document.cookie = `${THEME_KEY}=dark; Path=/`;
    navigation.pathname = "/es/dashboard";
    rerender(<ThemeSync />);
    expect(root.dataset.theme).toBe("dark");
  });
});
