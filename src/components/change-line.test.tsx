import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChangeLine } from "./change-line";

describe("ChangeLine", () => {
  it.each(["up", "down", "same"] as const)("con la flecha %s (decorativa: el texto ya lo dice)", (direction) => {
    const { container } = render(<ChangeLine change={{ direction, text: "15% más que agosto" }} />);
    expect(screen.getByText("15% más que agosto")).toBeVisible();
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden");
    expect(icon?.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });

  it("cada dirección con su propia flecha", () => {
    const paths = (["up", "down", "same"] as const).map((direction) => {
      const { container, unmount } = render(<ChangeLine change={{ direction, text: "x" }} />);
      const d = container.querySelector("path")?.getAttribute("d");
      unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(3);
  });
});
