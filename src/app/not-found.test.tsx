import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
  it("explica en español que la página no existe y ofrece volver al inicio", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    expect(screen.getByText("Error 404")).toBeVisible();
    // "/" lleva al dashboard con sesión y a la portada sin ella (src/proxy.ts).
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("tiene su propio título", () => {
    expect(metadata.title).toBe("Página no encontrada");
  });
});
