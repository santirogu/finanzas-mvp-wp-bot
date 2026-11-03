import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { InEnglish } from "../../test/locale";
import { NoticeBanner, NoticeBox } from "./notice-banner";

afterEach(() => {
  document.cookie = "aviso-cerrado=; Path=/; Max-Age=0";
});

describe("NoticeBanner", () => {
  it("el aviso importante, con su nombre para el lector de pantalla", () => {
    render(<NoticeBanner notice={{ message: "Mantenimiento el sábado de 8 a 9", tone: "important", version: "123" }} />);
    const region = screen.getByRole("region", { name: "Aviso importante" });
    expect(region).toHaveTextContent("Mantenimiento el sábado de 8 a 9");
    expect(region).toHaveClass("bg-danger-surface");
  });

  it("la ✕ lo oculta y guarda su versión en la cookie, para que no vuelva al recargar", async () => {
    render(<NoticeBanner notice={{ message: "Nuevo: presupuestos", tone: "info", version: "1792767600000" }} />);
    expect(screen.getByRole("region", { name: "Aviso general" })).toHaveClass("bg-brand/10");
    await userEvent.click(screen.getByRole("button", { name: "Ocultar este aviso" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.cookie).toContain("aviso-cerrado=1792767600000");
  });

  it("en inglés", () => {
    render(<NoticeBanner notice={{ message: "Maintenance", tone: "important", version: "1" }} />, { wrapper: InEnglish });
    expect(screen.getByRole("region", { name: "Important notice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide this notice" })).toBeInTheDocument();
  });
});

describe("NoticeBox", () => {
  it("sin onHide (la vista previa del admin), sin la ✕", () => {
    render(<NoticeBox message="Nuevo: presupuestos" tone="info" />);
    expect(screen.getByRole("region", { name: "Aviso general" })).toHaveTextContent("Nuevo: presupuestos");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
