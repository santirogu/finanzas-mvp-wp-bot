import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBadge, AdminShield } from "./admin-badge";

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

describe("AdminBadge del super admin", () => {
  it("dice Super admin, en dorado (no en el violeta de los admins)", () => {
    render(<AdminBadge superAdmin />);
    const classes = screen.getByText("Super admin").className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["text-superadmin", "bg-superadmin-surface", "border-superadmin-border"]));
    expect(classes.join(" ")).not.toMatch(/\b(text|bg|border)-admin\b/);
    expect(screen.queryByText("Admin")).toBeNull();
  });
});

describe("AdminShield", () => {
  it("es decorativo (el botón de la cuenta ya dice \"admin\") y usa los colores de admin", () => {
    const { container } = render(<AdminShield />);
    const shield = container.querySelector("[data-admin-shield]")!;
    expect(shield).toHaveAttribute("aria-hidden");
    expect(shield.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-admin", "bg-admin-surface", "border-admin-border"]));
  });
});

describe("AdminShield del super admin", () => {
  it("va en dorado", () => {
    const { container } = render(<AdminShield superAdmin />);
    const classes = container.querySelector("[data-admin-shield]")!.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["text-superadmin", "bg-superadmin-surface", "border-superadmin-border"]));
    expect(classes).not.toContain("text-admin");
  });
});
