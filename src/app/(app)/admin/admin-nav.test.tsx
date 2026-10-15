import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      ["Categorías", "/admin/categorias"],
      ["Seguridad", "/admin/seguridad"],
    ]);
    expect(screen.queryByText("Bot de WhatsApp")).toBeNull();
  });

  it.each([
    ["/admin", "Inicio"],
    ["/admin/historial", "Historial"],
    ["/admin/usuarios", "Usuarios"],
    // El detalle de una cuenta sigue en Usuarios.
    ["/admin/usuarios/abc123", "Usuarios"],
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
