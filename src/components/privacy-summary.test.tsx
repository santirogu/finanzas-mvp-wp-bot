import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DATA_CONTROLLER } from "@/lib/contact";
import { InEnglish } from "../../test/locale";
import { PrivacySummary } from "./privacy-summary";

// Lo que la Ley 1581 (art. 12) pide informar al pedir la autorización.
describe("PrivacySummary", () => {
  it("quién es el responsable con su correo y su teléfono, para quién es la app, los datos sensibles y los derechos", () => {
    render(<PrivacySummary />);
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["Quién los trata", "Para quién es", "Qué datos", "Para qué", "Con quién", "Datos sensibles", "Tus derechos"]);
    const who = screen.getByText(/responsable del tratamiento/);
    expect(who).toHaveTextContent(DATA_CONTROLLER.name);
    expect(who).toHaveTextContent(DATA_CONTROLLER.email);
    expect(who).toHaveTextContent(DATA_CONTROLLER.phone);
    expect(screen.getByText(/darlos es opcional: no estás obligado a autorizar su tratamiento/)).toBeVisible();
    // Los derechos del art. 8, también pedir la prueba y el acceso gratis.
    const rights = screen.getByText(/^Conocer, actualizar, rectificar y eliminar/);
    expect(rights).toHaveTextContent("pedir la prueba de esta autorización");
    expect(rights).toHaveTextContent("acceder a ellos gratis");
    expect(rights).toHaveTextContent("Superintendencia de Industria y Comercio");
  });

  it("en inglés", () => {
    render(<PrivacySummary />, { wrapper: InEnglish });
    expect(screen.getByText("Only people 18 or older.")).toBeVisible();
    expect(screen.getByText("Sensitive data")).toBeVisible();
    expect(screen.getByText(/to ask for proof of this authorization/)).toBeVisible();
  });
});
