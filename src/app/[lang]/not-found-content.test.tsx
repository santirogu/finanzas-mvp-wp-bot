import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOT_FOUND_TEXTS, NotFoundContent } from "./not-found-content";

describe("NotFoundContent", () => {
  it("explica en español que la página no existe y ofrece volver al inicio", () => {
    render(<NotFoundContent text={NOT_FOUND_TEXTS.es} />);
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    expect(screen.getByText("Error 404")).toBeVisible();
    // "/" lleva al dashboard con sesión y a la portada sin ella (src/proxy.ts).
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    expect(NOT_FOUND_TEXTS.es.title).toBe("Página no encontrada");
  });

  it("en inglés", () => {
    render(<NotFoundContent text={NOT_FOUND_TEXTS.en} />);
    expect(screen.getByRole("heading", { level: 1, name: "We couldn't find this page" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    expect(NOT_FOUND_TEXTS.en.title).toBe("Page not found");
  });
});
