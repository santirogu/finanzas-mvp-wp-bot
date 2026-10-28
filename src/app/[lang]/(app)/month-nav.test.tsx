import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { monthNav } from "@/lib/month-nav";
import { MonthNav } from "./month-nav";
import { InEnglish } from "../../../../test/locale";

// Viendo septiembre de 2026 en Egresos, con movimientos en octubre (el actual), agosto y marzo de 2025.
const OCTOBER = { year: 2026, month: 10 };
const SEPTEMBER = monthNav("/egresos", { year: 2026, month: 9 }, OCTOBER, ["2026-10", "2026-08", "2025-03"]);

const toggle = () => screen.getByRole("button", { name: "Septiembre de 2026" });
// La tarjeta que abre el botón (aria-controls): está en la página, oculta (`hidden`) mientras no se abre.
const card = (button = toggle()) => document.getElementById(button.getAttribute("aria-controls")!)!;
const shownYear = () => within(card()).getByText(/^\d{4}$/).textContent;
const month = (name: string | RegExp) => within(card()).getByRole("link", { name });

describe("MonthNav", () => {
  it("las flechas llevan al mes anterior y al siguiente, y 'Volver al mes actual' al de hoy", () => {
    render(<MonthNav nav={SEPTEMBER} />);
    expect(screen.getByRole("link", { name: "Mes anterior: agosto de 2026" })).toHaveAttribute(
      "href",
      "/egresos?mes=2026-08",
    );
    expect(screen.getByRole("link", { name: "Mes siguiente: octubre de 2026" })).toHaveAttribute("href", "/egresos");
    expect(screen.getByRole("link", { name: "Volver al mes actual" })).toHaveAttribute("href", "/egresos");
  });

  it("en el mes actual, la flecha siguiente está apagada y no hay 'Volver al mes actual'", () => {
    render(<MonthNav nav={monthNav("/egresos", OCTOBER, OCTOBER, [])} />);
    const next = screen.getByRole("link", { name: "Mes siguiente" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    expect(screen.queryByRole("link", { name: "Volver al mes actual" })).toBeNull();
    // La anterior sí: lleva a septiembre aunque no haya movimientos.
    expect(screen.getByRole("link", { name: "Mes anterior: septiembre de 2026" })).toHaveAttribute(
      "href",
      "/egresos?mes=2026-09",
    );
  });

  it("en enero de 2000 (el primero que se puede ver), la flecha anterior está apagada", () => {
    render(<MonthNav nav={monthNav("/egresos", { year: 2000, month: 1 }, OCTOBER, [])} />);
    expect(screen.getByRole("link", { name: "Mes anterior" })).toHaveAttribute("aria-disabled", "true");
  });

  it("en el Resumen, el mes es el título de la página; en las listas, no", () => {
    const { unmount } = render(<MonthNav nav={SEPTEMBER} heading />);
    expect(screen.getByRole("heading", { level: 1, name: "Septiembre de 2026" })).toContainElement(toggle());
    unmount();

    render(<MonthNav nav={SEPTEMBER} />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("al tocar el mes abre la tarjeta en su año, con los 12 meses", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    expect(card()).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Elegir un mes" })).toBe(card());
    expect(card()).toBeVisible();
    expect(shownYear()).toBe("2026");
    // Lo que se ve (la abreviatura); el nombre completo es para el lector de pantalla.
    expect(within(card()).getAllByRole("listitem").map((li) => li.querySelector("[aria-hidden]")?.textContent)).toEqual([
      "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic",
    ]);
  });

  it("cada mes lleva a su página y dice si es el elegido, el actual o si tiene movimientos", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    await userEvent.click(toggle());

    expect(month("enero de 2026")).toHaveAttribute("href", "/egresos?mes=2026-01");
    expect(month("septiembre de 2026")).toHaveAttribute("aria-current", "page");
    expect(month("agosto de 2026, con movimientos")).not.toHaveAttribute("aria-current");
    expect(month("octubre de 2026 (este mes), con movimientos")).toHaveAttribute("href", "/egresos");
    // Los futuros se ven apagados y no llevan a ningún lado.
    for (const name of ["noviembre de 2026", "diciembre de 2026"]) {
      expect(month(name)).toHaveAttribute("aria-disabled", "true");
      expect(month(name)).not.toHaveAttribute("href");
    }
  });

  it("las flechas de la tarjeta cambian el año sin navegar, hasta el actual", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    await userEvent.click(toggle());
    expect(within(card()).getByRole("button", { name: "Año siguiente" })).toBeDisabled();

    await userEvent.click(within(card()).getByRole("button", { name: "Año anterior: 2025" }));

    expect(shownYear()).toBe("2025");
    expect(month("marzo de 2025, con movimientos")).toHaveAttribute("href", "/egresos?mes=2025-03");
    expect(month("diciembre de 2025")).toHaveAttribute("href", "/egresos?mes=2025-12");
    expect(within(card()).queryByRole("link", { current: "page" })).toBeNull();

    await userEvent.click(within(card()).getByRole("button", { name: "Año siguiente: 2026" }));
    expect(shownYear()).toBe("2026");
  });

  it("al volver a abrirla, muestra otra vez el año del mes que se ve", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    await userEvent.click(toggle());
    await userEvent.click(within(card()).getByRole("button", { name: "Año anterior: 2025" }));
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(shownYear()).toBe("2026");
  });

  it("no ofrece años antes del 2000", async () => {
    render(<MonthNav nav={monthNav("/egresos", { year: 2000, month: 5 }, OCTOBER, [])} />);
    const may = screen.getByRole("button", { name: "Mayo de 2000" });
    await userEvent.click(may);
    expect(within(card(may)).getByRole("button", { name: "Año anterior" })).toBeDisabled();
  });

  it("se cierra al tocar el mes otra vez, con Escape (el foco vuelve al botón) y al tocar fuera", async () => {
    render(
      <>
        <MonthNav nav={SEPTEMBER} />
        <p>Fuera</p>
      </>,
    );
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(card()).not.toBeVisible();

    await userEvent.click(toggle());
    await userEvent.tab();
    await userEvent.keyboard("{Escape}");
    expect(card()).not.toBeVisible();
    expect(toggle()).toHaveFocus();

    await userEvent.click(toggle());
    await userEvent.click(screen.getByText("Fuera"));
    expect(card()).not.toBeVisible();
  });

  it("se cierra al elegir un mes y cuando el foco sale de la tarjeta con Tab", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    await userEvent.click(toggle());
    // jsdom no navega (lo dice en la consola): aquí el enlace solo tiene que cerrar la tarjeta.
    const stay = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("click", stay);
    await userEvent.click(month("enero de 2026"));
    window.removeEventListener("click", stay);
    expect(card()).not.toBeVisible();

    await userEvent.click(toggle());
    // El año anterior, y los diez meses que se pueden elegir (el año siguiente está apagado).
    for (let i = 0; i < 11; i++) await userEvent.tab();
    expect(month("octubre de 2026 (este mes), con movimientos")).toHaveFocus();
    expect(card()).toBeVisible();
    await userEvent.tab(); // la flecha del mes siguiente
    expect(screen.getByRole("link", { name: "Mes siguiente: octubre de 2026" })).toHaveFocus();
    expect(card()).not.toBeVisible();
  });

  it("un clic dentro de la tarjeta (en el año) no la cierra", async () => {
    render(<MonthNav nav={SEPTEMBER} />);
    await userEvent.click(toggle());
    await userEvent.click(within(card()).getByText("2026"));
    expect(card()).toBeVisible();
  });
});

describe("MonthNav · en inglés", () => {
  it("los meses y las etiquetas en inglés", async () => {
    render(<MonthNav nav={monthNav("/egresos", { year: 2026, month: 9 }, OCTOBER, ["2026-10"], "en")} />, { wrapper: InEnglish });
    expect(screen.getByRole("link", { name: "Previous month: August 2026" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Next month: October 2026" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to this month" })).toHaveAttribute("href", "/egresos");
    const button = screen.getByRole("button", { name: "September 2026" });
    await userEvent.click(button);
    const picker = screen.getByRole("group", { name: "Choose a month" });
    expect(within(picker).getByRole("button", { name: "Previous year: 2025" })).toBeEnabled();
    expect(within(picker).getByRole("link", { name: "October 2026 (this month), with transactions" })).toBeVisible();
    expect(within(picker).getByText("Sep")).toBeVisible();
  });
});
