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

  it("dibuja la A, la punta del lápiz y el ✓ de brand-mark.json, con los colores de la marca de cada tema", () => {
    const { container } = render(<LogoMark className="size-9" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("size-9");
    expect(svg).toHaveAttribute("viewBox", BRAND_MARK.viewBox);
    expect(svg.querySelector("rect")).toHaveClass("fill-brand");
    const [letter, tip, cut, check] = svg.querySelectorAll("path");
    expect(letter).toHaveAttribute("d", BRAND_MARK.letter);
    expect(letter).toHaveClass("fill-brand-foreground");
    expect(tip).toHaveAttribute("d", BRAND_MARK.tip);
    expect(tip).toHaveClass("fill-brand-foreground", "stroke-brand-foreground");
    // El ✓, encima de su borde del color del fondo, que corta la "A".
    expect(cut).toHaveAttribute("d", BRAND_MARK.check);
    expect(cut).toHaveAttribute("stroke-width", String(BRAND_MARK.checkCutWidth));
    expect(cut).toHaveClass("stroke-brand");
    expect(check).toHaveAttribute("d", BRAND_MARK.check);
    expect(check).toHaveAttribute("stroke-width", String(BRAND_MARK.checkWidth));
    expect(check).toHaveClass("stroke-brand-foreground");
  });
});
