import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBadge } from "./admin-badge";

describe("AdminBadge", () => {
  it("dice Admin con texto (no depende solo del color) y el ícono es decorativo", () => {
    const { container } = render(<AdminBadge />);
    expect(screen.getByText("Admin")).toBeVisible();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("usa los colores propios de admin, distintos de la marca, ingresos y egresos", () => {
    render(<AdminBadge />);
    const classes = screen.getByText("Admin").className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["text-admin", "bg-admin-surface", "border-admin-border"]));
    expect(classes.join(" ")).not.toMatch(/brand|income|expense/);
  });
});
