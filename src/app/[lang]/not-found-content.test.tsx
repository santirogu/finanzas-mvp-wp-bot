import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { es } from "@/i18n/dictionaries/es";
import { NotFoundContent } from "./not-found-content";

describe("NotFoundContent", () => {
  it("explica en español que la página no existe y ofrece volver al inicio", () => {
    render(<NotFoundContent text={es.notFound} />);
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    expect(screen.getByText("Error 404")).toBeVisible();
    // "/" lleva al dashboard con sesión y a la portada sin ella (src/proxy.ts).
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("su título, en el diccionario", () => {
    expect(es.notFound.title).toBe("Página no encontrada");
  });
});
