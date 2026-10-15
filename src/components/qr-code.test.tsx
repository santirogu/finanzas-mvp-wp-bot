import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCode } from "./qr-code";

describe("QrCode", () => {
  it("es una imagen con nombre para los lectores de pantalla", () => {
    render(<QrCode value="otpauth://totp/x?secret=ABC" label="Código QR de prueba" />);
    const svg = screen.getByRole("img", { name: "Código QR de prueba" });
    expect(svg).toHaveAttribute("width", "208");
  });

  it("siempre negro sobre blanco (también en modo oscuro) y sin nada externo", () => {
    const { container } = render(<QrCode value="hola" label="QR" size={100} />);
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
    expect(container.querySelector("path")).toHaveAttribute("fill", "#000000");
    expect(container.innerHTML).not.toMatch(/https?:|<image|<img/);
  });

  it("el mismo texto da el mismo dibujo y otro texto, otro", () => {
    const draw = (value: string) => render(<QrCode value={value} label="QR" />).container.querySelector("path")!.getAttribute("d");
    const first = draw("otpauth://totp/a?secret=AAAA");
    expect(draw("otpauth://totp/a?secret=AAAA")).toBe(first);
    expect(draw("otpauth://totp/a?secret=BBBB")).not.toBe(first);
    expect(first).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
  });
});
