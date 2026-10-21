import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRAND_MARK } from "@/lib/brand";
import { Logo, LogoMark } from "./logo";

describe("Logo", () => {
  it("el ícono y el nombre; el ícono es decorativo", () => {
    const { container } = render(<Logo />);
    expect(container.textContent).toBe("Anotado");
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("dibuja el globo y el ✓ de brand-mark.json, con los colores de la marca de cada tema", () => {
    const { container } = render(<LogoMark className="size-9" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("size-9");
    expect(svg).toHaveAttribute("viewBox", BRAND_MARK.viewBox);
    expect(svg.querySelector("rect")).toHaveClass("fill-brand");
    const [bubble, check] = svg.querySelectorAll("path");
    expect(bubble).toHaveAttribute("d", BRAND_MARK.bubble);
    expect(bubble).toHaveClass("fill-brand-foreground");
    expect(check).toHaveAttribute("d", BRAND_MARK.check);
    expect(check).toHaveClass("stroke-brand");
  });
});
