import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_SCRIPT } from "@/lib/theme";
import { ThemePicker } from "./theme-picker";
import { InEnglish } from "../../../../../test/locale";

// La acción que la guarda en la cuenta se simula (su prueba: src/modules/account/language.int.test.ts).
const save = vi.hoisted(() => vi.fn<(theme: unknown) => Promise<void>>(async () => {}));
vi.mock("@/modules/account/actions", () => ({ saveThemeAction: save }));

const root = document.documentElement;
const runScript = () => new Function(THEME_SCRIPT)();
const cookieTheme = () => document.cookie.match(/(?:^|; )tema=([^;]*)/)?.[1];

afterEach(() => {
  localStorage.clear();
  document.cookie = `${THEME_KEY}=; Max-Age=0; Path=/`;
  delete root.dataset.theme;
  save.mockClear();
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

  it("la cookie (la que pone la cuenta al iniciar sesión) manda sobre lo guardado antes en localStorage", () => {
    localStorage.setItem(THEME_KEY, "dark");
    document.cookie = `${THEME_KEY}=light; Path=/`;
    runScript();
    expect(root.dataset.theme).toBe("light");
    // "Sistema" elegido también manda: no vuelve el oscuro de antes.
    document.cookie = `${THEME_KEY}=system; Path=/`;
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

  it("dos a la vez (la página de antes queda montada, oculta) no se desmarcan entre sí", async () => {
    localStorage.setItem(THEME_KEY, "light");
    render(
      <>
        <ThemePicker />
        <ThemePicker />
      </>,
    );
    const light = screen.getAllByRole("radio", { name: "Claro" });
    expect(light).toHaveLength(2);
    for (const radio of light) expect(radio).toBeChecked();
    await userEvent.click(screen.getAllByRole("radio", { name: "Oscuro" })[1]);
    for (const radio of screen.getAllByRole("radio", { name: "Oscuro" })) expect(radio).toBeChecked();
  });

  it("al elegir Oscuro lo aplica, lo guarda en este navegador (cookie y localStorage) y en la cuenta; Sistema lo quita", async () => {
    render(<ThemePicker />);
    await userEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(cookieTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
    expect(save).toHaveBeenLastCalledWith("dark");

    await userEvent.click(screen.getByRole("radio", { name: "Sistema" }));
    expect(cookieTheme()).toBe("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(root.dataset.theme).toBeUndefined();
    expect(save).toHaveBeenLastCalledWith("system");
  });

  it("muestra la de la cookie aunque localStorage diga otra", () => {
    localStorage.setItem(THEME_KEY, "dark");
    document.cookie = `${THEME_KEY}=light; Path=/`;
    render(<ThemePicker />);
    expect(screen.getByRole("radio", { name: "Claro" })).toBeChecked();
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

describe("ThemePicker · en inglés", () => {
  it("las opciones en inglés", () => {
    render(<ThemePicker />, { wrapper: InEnglish });
    expect(screen.getByRole("group", { name: "Appearance" })).toBeVisible();
    for (const name of ["System", "Light", "Dark"]) expect(screen.getByRole("radio", { name })).toBeInTheDocument();
  });
});
