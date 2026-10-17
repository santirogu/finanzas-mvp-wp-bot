import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const { NavTabs, TabLinks } = await import("./nav-tabs");

describe("NavTabs", () => {
  it("muestra las tres pestañas con sus enlaces", () => {
    render(<NavTabs />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Resumen", "/dashboard"],
      ["Ingresos", "/ingresos"],
      ["Egresos", "/egresos"],
    ]);
  });

  it.each([
    ["/dashboard", "Resumen"],
    ["/ingresos", "Ingresos"],
    ["/egresos", "Egresos"],
  ])("en %s marca %s como la página actual (y solo esa)", (pathname, active) => {
    navigation.pathname = pathname;
    render(<NavTabs />);
    for (const link of screen.getAllByRole("link")) {
      if (link.textContent === active) expect(link).toHaveAttribute("aria-current", "page");
      else expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("en otra página no marca ninguna pestaña", () => {
    navigation.pathname = "/simulador";
    render(<NavTabs />);
    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  });
});

describe("NavTabs · el mes que se está viendo", () => {
  afterEach(() => {
    navigation.search = "";
  });

  it("de septiembre en el Resumen se pasa a los ingresos y egresos de septiembre (no al admin)", () => {
    navigation.pathname = "/dashboard";
    navigation.search = "mes=2026-09&otro=1";
    render(<NavTabs showAdmin />);
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/dashboard?mes=2026-09",
      "/ingresos?mes=2026-09",
      "/egresos?mes=2026-09",
      "/admin",
    ]);
  });

  it.each(["mes=2026-13", "mes=septiembre", "mes=2026-09%26x%3D1", "otro=1"])(
    "con %s no se lleva nada (solo un mes bien escrito)",
    (search) => {
      navigation.search = search;
      render(<NavTabs />);
      expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
        "/dashboard",
        "/ingresos",
        "/egresos",
      ]);
    },
  );
});

describe("NavTabs · pestaña Admin", () => {
  it("sin el permiso no aparece", () => {
    navigation.pathname = "/dashboard";
    render(<NavTabs />);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("para un admin aparece al final y lleva a /admin", () => {
    navigation.pathname = "/dashboard";
    render(<NavTabs showAdmin />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Resumen", "Ingresos", "Egresos", "Admin"]);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it.each(["/admin", "/admin/verificacion"])("se marca en %s", (pathname) => {
    navigation.pathname = pathname;
    render(<NavTabs showAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("aria-current", "page");
  });

  it.each(["/administrador", "/dashboard"])("no se marca en %s", (pathname) => {
    navigation.pathname = pathname;
    render(<NavTabs showAdmin />);
    expect(screen.getByRole("link", { name: "Admin" })).not.toHaveAttribute("aria-current");
  });
});

describe("TabLinks", () => {
  it("sin ruta (mientras se resuelve) muestra las pestañas sin marcar ninguna", () => {
    render(<TabLinks pathname={null} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Resumen", "Ingresos", "Egresos"]);
    for (const link of links) expect(link).not.toHaveAttribute("aria-current");
  });
});
