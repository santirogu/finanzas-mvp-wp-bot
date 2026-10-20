import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton } from "./page-skeleton";

describe("PageSkeleton", () => {
  it("los lectores de pantalla anuncian que la página está cargando", () => {
    render(<PageSkeleton />);
    const status = screen.getByRole("status", { name: "Cargando" });
    expect(status).toHaveAttribute("aria-busy", "true");
  });
});
