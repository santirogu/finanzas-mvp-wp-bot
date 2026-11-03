import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_VALUES } from "@/modules/app-values/values";
import { findToast, renderWithToaster as render, toasts } from "../../../../../../test/toaster";

// La Server Action se simula: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo responde a cada
// resultado). Lo que hace de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({ changeAppValuesAction: vi.fn() }));
vi.mock("./actions", () => actions);

const { ValuesSettings } = await import("./values-settings");

// jsdom no tiene showModal ni close: lo mínimo para abrir y cerrar la ventana.
beforeEach(() => {
  actions.changeAppValuesAction.mockReset();
});

const section = () => within(screen.getByRole("region", { name: "Valores de la app" }));
const dialog = () => within(screen.getByRole("dialog"));
const open = () => userEvent.click(section().getByRole("button", { name: "Cambiar los valores" }));

describe("ValuesSettings", () => {
  it("los de siempre: avisos con 3 días, cerca desde el 80 % y fijos en 3 de 4 meses", () => {
    render(<ValuesSettings values={DEFAULT_APP_VALUES} lastChange={null} />);
    expect(section().getByText("Avisos de próximos pagos").nextElementSibling).toHaveTextContent(
      "Prendidos: 3 días antes. Para quien no los cambió en su Configuración.",
    );
    expect(section().getByText("Presupuestos").nextElementSibling).toHaveTextContent("Se acercan desde el 80 % (el aviso y el color del Resumen).");
    expect(section().getByText("Gastos fijos").nextElementSibling).toHaveTextContent(
      "Un egreso es fijo si aparece en al menos 3 de los últimos 4 meses.",
    );
    expect(section().getByText("Sin cambios: los de siempre.")).toBeInTheDocument();
  });

  it.each([
    [{ upcomingEnabled: false }, "Apagados."],
    [{ upcomingDays: 0 }, "Prendidos: el mismo día."],
    [{ upcomingDays: 1 }, "Prendidos: 1 día antes."],
  ])("los avisos %j: %s", (change, text) => {
    render(<ValuesSettings values={{ ...DEFAULT_APP_VALUES, ...change }} lastChange="Ana Admin · 23 de oct." />);
    expect(section().getByText("Avisos de próximos pagos").nextElementSibling).toHaveTextContent(text);
    expect(section().getByText("Último cambio: Ana Admin · 23 de oct.")).toBeInTheDocument();
  });

  it("cambiarlos: la ventana viene con los de ahora, se envían con el código y el aviso recibe el foco", async () => {
    actions.changeAppValuesAction.mockResolvedValue({ message: "Se guardaron los valores de la app." });
    render(<ValuesSettings values={{ ...DEFAULT_APP_VALUES, upcomingEnabled: false }} lastChange={null} />);
    await open();
    expect(screen.getByRole("dialog", { name: "Cambiar los valores" })).toHaveAccessibleDescription(/Aplican de inmediato/);
    expect(dialog().getByLabelText("Prendidos para quien no los cambió")).not.toBeChecked();
    expect(dialog().getByLabelText("Días antes")).toHaveValue(3);
    expect(dialog().getByLabelText("En al menos (meses)")).toHaveValue(3);
    expect(dialog().getByLabelText("De los últimos (meses)")).toHaveValue(4);

    await userEvent.click(dialog().getByLabelText("Prendidos para quien no los cambió"));
    await userEvent.clear(dialog().getByLabelText("Se acercan desde el (%)"));
    await userEvent.type(dialog().getByLabelText("Se acercan desde el (%)"), "70");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar" }));

    const sent = actions.changeAppValuesAction.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(sent)).toEqual({
      upcomingEnabled: "on",
      upcomingDays: "3",
      budgetNearShare: "70",
      recurringMinMonths: "3",
      recurringWindow: "4",
      code: "123456",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se guardaron los valores de la app.");
    expect(toast).toHaveFocus();
  });

  it("un error del servidor va en su campo; lo escrito sigue ahí y el código no", async () => {
    actions.changeAppValuesAction.mockResolvedValue({ error: "Escribe de 2 meses hasta los que se miran.", field: "recurringMinMonths" });
    render(<ValuesSettings values={DEFAULT_APP_VALUES} lastChange={null} />);
    await open();
    await userEvent.clear(dialog().getByLabelText("En al menos (meses)"));
    await userEvent.type(dialog().getByLabelText("En al menos (meses)"), "5");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar" }));
    // La respuesta vuelve a montar los campos (con lo enviado): se espera a que el error esté.
    await vi.waitFor(() => expect(dialog().getByLabelText("En al menos (meses)")).toHaveAccessibleDescription("Escribe de 2 meses hasta los que se miran."));
    expect(dialog().getByLabelText("En al menos (meses)")).toHaveValue(5);
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveValue("");
    expect(toasts()).toHaveLength(0);
  });

  it("fuera de rango o sin el código, lo dice en español sin enviar nada", async () => {
    render(<ValuesSettings values={DEFAULT_APP_VALUES} lastChange={null} />);
    await open();
    await userEvent.clear(dialog().getByLabelText("Se acercan desde el (%)"));
    await userEvent.type(dialog().getByLabelText("Se acercan desde el (%)"), "40");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar" }));
    expect(dialog().getByLabelText("Se acercan desde el (%)")).toHaveAccessibleDescription(/Escribe un porcentaje de 50 a 95\./);
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription("Escribe el código de 6 dígitos de Google Authenticator.");
    expect(actions.changeAppValuesAction).not.toHaveBeenCalled();
  });
});

describe("ValuesSettings en inglés", () => {
  it("los textos y la ventana", async () => {
    render(<ValuesSettings values={{ ...DEFAULT_APP_VALUES, budgetNearShare: 75 }} lastChange={null} />, { english: true });
    const card = within(screen.getByRole("region", { name: "App values" }));
    expect(card.getByText("Budgets").nextElementSibling).toHaveTextContent("Getting close from 75% (the notice and the Overview color).");
    expect(card.getByText("No changes: the defaults apply.")).toBeInTheDocument();
    await userEvent.click(card.getByRole("button", { name: "Change the values" }));
    expect(dialog().getByLabelText("Getting close from (%)")).toHaveValue(75);
  });
});
