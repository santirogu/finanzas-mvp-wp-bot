import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../../test/locale";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { AdminNav } = await import("./admin-nav");

describe("AdminNav", () => {
  it("muestra Inicio y los módulos activos, sin los que vienen", () => {
    render(<AdminNav />);
    const nav = screen.getByRole("navigation", { name: "Secciones de administración" });
    const links = screen.getAllByRole("link");
    expect(nav).toContainElement(links[0]);
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Inicio", "/admin"],
      ["Historial", "/admin/historial"],
      ["Usuarios", "/admin/usuarios"],
      ["Bot de WhatsApp", "/admin/bot"],
      ["Categorías", "/admin/categorias"],
      ["Salud del sistema", "/admin/salud"],
      ["Seguridad", "/admin/seguridad"],
    ]);
    expect(screen.queryByText("Configuración")).toBeNull();
  });

  it.each([
    ["/admin", "Inicio"],
    ["/admin/historial", "Historial"],
    ["/admin/usuarios", "Usuarios"],
    // El detalle de una cuenta sigue en Usuarios.
    ["/admin/usuarios/abc123", "Usuarios"],
    ["/admin/bot", "Bot de WhatsApp"],
    ["/admin/categorias", "Categorías"],
    ["/admin/seguridad", "Seguridad"],
  ])("en %s marca %s como la página actual (y solo esa)", (pathname, current) => {
    navigation.pathname = pathname;
    render(<AdminNav />);
    for (const link of screen.getAllByRole("link")) {
      if (link.textContent === current) expect(link).toHaveAttribute("aria-current", "page");
      else expect(link).not.toHaveAttribute("aria-current");
    }
  });
});

describe("AdminNav en inglés", () => {
  it("los chips y el nombre del menú, con las mismas rutas", () => {
    navigation.pathname = "/admin/usuarios/abc123";
    render(<AdminNav />, { wrapper: InEnglish });
    expect(screen.getByRole("navigation", { name: "Administration sections" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Home", "/admin"],
      ["History", "/admin/historial"],
      ["Users", "/admin/usuarios"],
      ["WhatsApp bot", "/admin/bot"],
      ["Categories", "/admin/categorias"],
      ["System health", "/admin/salud"],
      ["Security", "/admin/seguridad"],
    ]);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  });
});
