import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT } from "@/lib/theme";
import { ThemePicker } from "./theme-picker";

const root = document.documentElement;
const runScript = () => new Function(THEME_SCRIPT)();

afterEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
});

describe("el script de tema del <head>", () => {
  it("aplica el tema guardado; sin tema (o con uno raro), el del sistema", () => {
    runScript();
    expect(root.dataset.theme).toBeUndefined();

    localStorage.setItem(THEME_KEY, "dark");
    runScript();
    expect(root.dataset.theme).toBe("dark");

    localStorage.setItem(THEME_KEY, "<script>");
    runScript();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("sigue el cambio hecho en otra pestaña", () => {
    runScript();
    localStorage.setItem(THEME_KEY, "light");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
    expect(root.dataset.theme).toBe("light");
  });
});

describe("ThemePicker", () => {
  it("empieza en Sistema y ofrece Claro y Oscuro", () => {
    render(<ThemePicker />);
    expect(screen.getByRole("group", { name: "Apariencia" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => (r.closest("label") as HTMLElement).textContent)).toEqual(["Sistema", "Claro", "Oscuro"]);
    expect(screen.getByRole("radio", { name: "Sistema" })).toBeChecked();
  });

  it("al elegir Oscuro lo guarda y lo aplica; Sistema lo quita", async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Sistema" }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("muestra lo que ya estaba guardado, y lo que se cambie en otra pestaña", () => {
    localStorage.setItem(THEME_KEY, "light");
    render(<ThemePicker />);
    expect(screen.getByRole("radio", { name: "Claro" })).toBeChecked();

    act(() => {
      localStorage.setItem(THEME_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
    });
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  });
});
