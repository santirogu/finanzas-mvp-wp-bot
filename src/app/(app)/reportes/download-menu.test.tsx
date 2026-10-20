import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DownloadMenu } from "./download-menu";

const HREFS = { csvHref: "/reportes/exportar", pdfHref: "/reportes/pdf" };
const toggle = () => screen.getByRole("button", { name: "Descargar" });
const list = () => screen.queryByRole("group", { name: "Opciones de descarga" });

describe("DownloadMenu", () => {
  it("cerrado, solo el botón con el ícono (que dice qué hace y qué controla)", () => {
    render(<DownloadMenu csvHref="/reportes/exportar?periodo=2025" pdfHref="/reportes/pdf?periodo=2025" />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveTextContent("");
    expect(toggle().querySelector("svg")).toHaveAttribute("aria-hidden");
    expect(list()).toBeNull();
    expect(document.getElementById(toggle().getAttribute("aria-controls")!)).toBeInTheDocument();
  });

  it("al tocarlo, la lista: el CSV y el PDF del período, como descargas", async () => {
    const user = userEvent.setup();
    render(<DownloadMenu csvHref="/reportes/exportar?periodo=2025" pdfHref="/reportes/pdf?periodo=2025" />);
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveClass("border-brand");
    const csv = screen.getByRole("link", { name: /Movimientos \(CSV\)/ });
    expect(csv).toHaveAttribute("href", "/reportes/exportar?periodo=2025");
    expect(csv).toHaveAttribute("download");
    expect(csv).toHaveTextContent("Para Excel o Google Sheets");
    const pdf = screen.getByRole("link", { name: /Reporte \(PDF\)/ });
    expect(pdf).toHaveAttribute("href", "/reportes/pdf?periodo=2025");
    expect(pdf).toHaveAttribute("download");
    expect(pdf).toHaveTextContent("Para guardar o imprimir");
  });

  it.each([/Movimientos \(CSV\)/, /Reporte \(PDF\)/])("elegir una descarga (%s) cierra la lista", async (name) => {
    const user = userEvent.setup();
    render(<DownloadMenu {...HREFS} />);
    await user.click(toggle());
    const link = screen.getByRole("link", { name });
    // Sin navegar de verdad (jsdom no descarga): solo el clic.
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(list()).toBeNull();
  });

  it("tocarlo otra vez la cierra", async () => {
    const user = userEvent.setup();
    render(<DownloadMenu {...HREFS} />);
    await user.click(toggle());
    await user.click(toggle());
    expect(list()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape la cierra y el foco vuelve al botón", async () => {
    const user = userEvent.setup();
    render(<DownloadMenu {...HREFS} />);
    await user.click(toggle());
    await user.keyboard("{Tab}");
    expect(screen.getByRole("link", { name: /Movimientos \(CSV\)/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(list()).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it("otra tecla no la cierra", async () => {
    const user = userEvent.setup();
    render(<DownloadMenu {...HREFS} />);
    await user.click(toggle());
    await user.keyboard("{ArrowDown}a");
    expect(list()).not.toBeNull();
  });

  it("tocar fuera la cierra; tocar dentro, no", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DownloadMenu {...HREFS} />
        <p>Afuera</p>
      </>,
    );
    await user.click(toggle());
    await user.click(list()!);
    expect(list()).not.toBeNull();
    await user.click(screen.getByText("Afuera"));
    expect(list()).toBeNull();
  });

  it("salir con Tab la cierra; moverse dentro, no", async () => {
    const user = userEvent.setup();
    render(
      <>
        <DownloadMenu {...HREFS} />
        <button type="button">Después</button>
      </>,
    );
    await user.click(toggle());
    await user.tab();
    await user.tab();
    expect(screen.getByRole("link", { name: /Reporte \(PDF\)/ })).toHaveFocus();
    expect(list()).not.toBeNull();
    await user.tab();
    expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
    expect(list()).toBeNull();
  });

  it("perder el foco hacia ningún lado (la ventana) no la cierra", async () => {
    const user = userEvent.setup();
    render(<DownloadMenu {...HREFS} />);
    await user.click(toggle());
    fireEvent.blur(toggle(), { relatedTarget: null });
    expect(list()).not.toBeNull();
  });
});
