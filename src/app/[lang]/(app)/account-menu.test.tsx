import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../test/locale";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AccountMenu } = await import("./account-menu");

const signOut = vi.fn(async () => {});
const toggle = (name = /^Tu cuenta: /) => screen.getByRole("button", { name });
// La tarjeta que abre el botón (aria-controls): está en la página, oculta (`hidden`) mientras no se abre.
const card = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;

function renderMenu(props: Partial<Parameters<typeof AccountMenu>[0]> = {}) {
  return render(
    <>
      <AccountMenu name="Santiago Rodriguez Gutierrez" email="santi@test.local" signOut={signOut} {...props} />
      <p>Fuera</p>
    </>,
  );
}

beforeEach(() => {
  navigation.pathname = "/dashboard";
  signOut.mockClear();
});

describe("AccountMenu", () => {
  it("en la barra, solo el círculo con las iniciales; el botón dice de quién es la cuenta", () => {
    renderMenu();
    expect(toggle()).toHaveAccessibleName("Tu cuenta: Santiago Rodriguez Gutierrez");
    expect(toggle()).toHaveTextContent("SR");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(card()).not.toBeVisible();
  });

  it("sin nombre, el correo (en el nombre del botón y en las iniciales)", () => {
    renderMenu({ name: "" });
    expect(toggle()).toHaveAccessibleName("Tu cuenta: santi@test.local");
    expect(toggle()).toHaveTextContent("S");
  });

  it("al tocarlo abre la tarjeta: nombre, correo, Mi cuenta, Configuración, Ayuda y Salir", async () => {
    renderMenu();
    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Tu cuenta" })).toBe(card());
    expect(card()).toBeVisible();
    expect(card()).toHaveTextContent("Santiago Rodriguez Gutierrez");
    expect(card()).toHaveTextContent("santi@test.local");
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.getByRole("link", { name: "Configuración" })).toHaveAttribute("href", "/configuracion");
    expect(screen.getByRole("link", { name: "Ayuda" })).toHaveAttribute("href", "/ayuda");
    expect(screen.getByRole("button", { name: "Salir" })).toHaveClass("text-danger");
  });

  it("Salir envía la acción que cierra la sesión", async () => {
    renderMenu();
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ["/cuenta", "Mi cuenta", "Ayuda"],
    ["/configuracion", "Configuración", "Mi cuenta"],
    ["/ayuda", "Ayuda", "Mi cuenta"],
  ])("en %s, marca %s como la página actual (y no %s)", async (pathname, current, other) => {
    navigation.pathname = pathname;
    renderMenu();
    await userEvent.click(toggle());
    expect(screen.getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
  });

  it("para un admin: el botón lo dice, y se ven el escudo y la etiqueta que manda el servidor", async () => {
    renderMenu({ roleName: "admin", shield: <span data-testid="escudo" />, badge: <span>Admin</span> });
    expect(toggle()).toHaveAccessibleName("Tu cuenta: Santiago Rodriguez Gutierrez, admin");
    expect(screen.getByTestId("escudo")).toBeInTheDocument();
    await userEvent.click(toggle());
    expect(card()).toHaveTextContent("Admin");
  });

  it("para el super admin, el botón dice \"super admin\"", () => {
    renderMenu({ roleName: "super admin", shield: <span data-testid="escudo" />, badge: <span>Super admin</span> });
    expect(toggle()).toHaveAccessibleName("Tu cuenta: Santiago Rodriguez Gutierrez, super admin");
  });

  it("se cierra al tocar el botón otra vez, con Escape (el foco vuelve al botón) y al tocar fuera", async () => {
    renderMenu();
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(card()).not.toBeVisible();

    await userEvent.click(toggle());
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    expect(card()).not.toBeVisible();
    expect(toggle()).toHaveFocus();

    await userEvent.click(toggle());
    await userEvent.click(screen.getByText("Fuera"));
    expect(card()).not.toBeVisible();
  });

  it("se recorre con Tab y se cierra cuando el foco sale de la tarjeta", async () => {
    render(
      <>
        <AccountMenu name="Ana" email="ana@test.local" signOut={signOut} />
        <button type="button">Después</button>
      </>,
    );
    await userEvent.click(toggle());
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Configuración" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Ayuda" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Salir" })).toHaveFocus();
    expect(card()).toBeVisible();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(card()).not.toBeVisible();
  });

  it.each(["Mi cuenta", "Configuración", "Ayuda"])("al elegir %s se cierra", async (name) => {
    renderMenu();
    await userEvent.click(toggle());
    // jsdom no navega (lo dice en la consola): aquí el enlace solo tiene que cerrar la tarjeta.
    const stay = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("click", stay);
    await userEvent.click(screen.getByRole("link", { name }));
    window.removeEventListener("click", stay);
    expect(card()).not.toBeVisible();
  });
});

describe("AccountMenu · en inglés", () => {
  it("el botón, la tarjeta y sus opciones en inglés", async () => {
    render(<AccountMenu name="Ana" email="ana@test.local" signOut={signOut} />, { wrapper: InEnglish });
    const button = screen.getByRole("button", { name: "Your account: Ana" });
    await userEvent.click(button);
    expect(screen.getByRole("group", { name: "Your account" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My account" })).toHaveAttribute("href", "/cuenta");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/ayuda");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
