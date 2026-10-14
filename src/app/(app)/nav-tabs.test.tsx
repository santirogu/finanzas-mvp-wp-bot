import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const { NavTabs } = await import("./nav-tabs");

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
