import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActiveFilters } from "./active-filters";

const items = [
  { label: "Rol: Admin", href: "/admin/usuarios?q=ana" },
  { label: "“ana”", href: "/admin/usuarios?rol=admin" },
];

describe("ActiveFilters", () => {
  it("sin filtros, nada", () => {
    const { container } = render(<ActiveFilters items={[]} clearHref="/admin/usuarios" locale="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cada filtro con su enlace para quitarlo, y Quitar todo", () => {
    render(<ActiveFilters items={items} clearHref="/admin/usuarios" locale="es" />);
    expect(screen.getByRole("list", { name: "Filtros activos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitar filtro: Rol: Admin" })).toHaveAttribute("href", "/admin/usuarios?q=ana");
    expect(screen.getByRole("link", { name: "Quitar todo" })).toHaveAttribute("href", "/admin/usuarios");
  });

  it("en inglés", () => {
    render(<ActiveFilters items={[{ label: "Role: Admin", href: "/admin/usuarios" }]} clearHref="/admin/usuarios" locale="en" />);
    expect(screen.getByRole("list", { name: "Active filters" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remove filter: Role: Admin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear all" })).toBeInTheDocument();
  });
});
