import { screen, within } from "@testing-library/react";
import { findToast, renderWithToaster as render, toasts } from "../../../../../test/toaster";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotSettingsProps } from "./bot-settings";

// Las Server Actions se simulan: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo
// responde a cada resultado). Lo que hacen de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({
  pauseClaudeAction: vi.fn(),
  resumeClaudeAction: vi.fn(),
  changeAiLimitsAction: vi.fn(),
  changeMonthlyLimitAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { BotSettings } = await import("./bot-settings");

// jsdom no tiene showModal ni close: lo mínimo para abrir y cerrar la ventana.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const props = (overrides: Partial<BotSettingsProps> = {}): BotSettingsProps => ({
  claudePaused: false,
  limits: { perHour: 20, perDay: 100 },
  monthlyTokenLimit: null,
  month: { used: 37579, reached: false, resetsOn: "1 de noviembre" },
  averageTokensPerCall: 1708,
  lastChange: null,
  ...overrides,
});

const section = () => within(screen.getByRole("region", { name: "Configuración" }));
const dialog = () => within(screen.getByRole("dialog"));

describe("BotSettings", () => {
  it("con Claude activo: el estado, los topes y que nadie la ha cambiado", () => {
    render(<BotSettings {...props()} />);
    const rows = section().getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ClaudeActivo: entiende los mensajes escritos libremente.");
    expect(rows[1]).toHaveTextContent("Topes por cuenta20 por hora y 100 por día, de mensajes con Claude.");
    expect(section().getByText("Sin cambios: valen los de siempre.")).toBeInTheDocument();
    expect(section().getByRole("button", { name: "Pausar Claude" })).toBeInTheDocument();
  });

  it("en pausa lo resalta, ofrece reanudar y muestra quién la cambió", () => {
    render(<BotSettings {...props({ claudePaused: true, limits: { perHour: 5, perDay: 1500 }, lastChange: "Ana Admin · 16 de oct" })} />);
    expect(section().getByText("En pausa: el bot solo responde balance, deshacer y ayuda.")).toHaveClass("text-danger");
    expect(section().getByRole("button", { name: "Reanudar Claude" })).toBeInTheDocument();
    expect(section().getAllByRole("listitem")[1]).toHaveTextContent("5 por hora y 1.500 por día");
    expect(section().getByText("Último cambio: Ana Admin · 16 de oct")).toBeInTheDocument();
  });

  it("pausar pide el código, envía la acción y muestra el aviso al terminar", async () => {
    actions.pauseClaudeAction.mockResolvedValue({ message: "Claude quedó en pausa." });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Pausar Claude" }));
    expect(screen.getByRole("dialog", { name: "¿Pausar Claude?" })).toHaveAccessibleDescription(/no gasta créditos de Anthropic/);
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Pausar" }));

    expect(actions.pauseClaudeAction).toHaveBeenCalledTimes(1);
    expect((actions.pauseClaudeAction.mock.calls[0][1] as FormData).get("code")).toBe("123456");
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await findToast();
    expect(toast).toHaveTextContent("Claude quedó en pausa.");
    // Pausar es apagar algo: en rojo.
    expect(toast).toHaveAttribute("data-tone", "removal");
  });

  it("reanudar usa su propia acción", async () => {
    actions.resumeClaudeAction.mockResolvedValue({ message: "Claude volvió a funcionar." });
    render(<BotSettings {...props({ claudePaused: true })} />);
    await userEvent.click(section().getByRole("button", { name: "Reanudar Claude" }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Reanudar" }));
    expect(actions.resumeClaudeAction).toHaveBeenCalledTimes(1);
    expect(actions.pauseClaudeAction).not.toHaveBeenCalled();
    expect(await findToast()).toHaveAttribute("data-tone", "success");
  });

  it("un código equivocado se muestra en su campo y la ventana sigue abierta", async () => {
    actions.pauseClaudeAction.mockResolvedValue({ error: "El código no es correcto.", field: "code" });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Pausar Claude" }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "111111");
    await userEvent.click(dialog().getByRole("button", { name: "Pausar" }));
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription("El código no es correcto.");
    expect(toasts()).toHaveLength(0);
  });

  it("los topes vienen llenos con los actuales y se envían con el código", async () => {
    actions.changeAiLimitsAction.mockResolvedValue({ message: "Los topes quedaron en 30 por hora y 150 por día, por cuenta." });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar los topes por cuenta" }));
    const perHour = dialog().getByLabelText("Por hora");
    expect(perHour).toHaveValue("20");
    expect(dialog().getByLabelText("Por día")).toHaveValue("100");
    expect(screen.getByRole("dialog", { name: "Cambiar los topes por cuenta" })).toHaveAccessibleDescription(
      /Hasta 200 por hora y 2\.000 por día\./,
    );

    await userEvent.clear(perHour);
    await userEvent.type(perHour, "30");
    await userEvent.clear(dialog().getByLabelText("Por día"));
    await userEvent.type(dialog().getByLabelText("Por día"), "150");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar topes" }));

    const sent = actions.changeAiLimitsAction.mock.calls[0][1] as FormData;
    expect([sent.get("perHour"), sent.get("perDay"), sent.get("code")]).toEqual(["30", "150", "123456"]);
    expect(await findToast()).toHaveTextContent("Los topes quedaron en 30 por hora y 150 por día");
  });

  it("un tope fuera de rango se muestra debajo de su campo; uno que no cambia, en la ventana", async () => {
    actions.changeAiLimitsAction
      .mockResolvedValueOnce({ error: "El tope por día va de 1 a 2.000.", field: "perDay" })
      .mockResolvedValueOnce({ error: "Los topes ya son esos: cambia alguno." });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar los topes por cuenta" }));
    await userEvent.clear(dialog().getByLabelText("Por día"));
    await userEvent.type(dialog().getByLabelText("Por día"), "3000");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar topes" }));
    expect(dialog().getByLabelText("Por día")).toHaveAccessibleDescription("El tope por día va de 1 a 2.000.");
    expect(dialog().getByLabelText("Por día")).toHaveAttribute("aria-invalid", "true");
    // Lo escrito sigue ahí para corregirlo; el código se borra (sirve una sola vez).
    expect(dialog().getByLabelText("Por día")).toHaveValue("3000");
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveValue("");

    // userEvent recuerda el valor de antes de que React limpiara el campo: se borra primero.
    await userEvent.clear(dialog().getByLabelText("Código de Google Authenticator"));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "654321");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar topes" }));
    expect(dialog().getByRole("alert")).toHaveTextContent("Los topes ya son esos: cambia alguno.");
  });

  it("sin llenar los campos, los errores salen en español y no se envía nada", async () => {
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar los topes por cuenta" }));
    await userEvent.clear(dialog().getByLabelText("Por hora"));
    await userEvent.click(dialog().getByRole("button", { name: "Guardar topes" }));
    expect(dialog().getByLabelText("Por hora")).toHaveAccessibleDescription("Escribe cuántos mensajes por hora.");
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription(
      "Escribe el código de 6 dígitos de Google Authenticator.",
    );
    expect(actions.changeAiLimitsAction).not.toHaveBeenCalled();
  });

  it("Cancelar cierra la ventana sin enviar nada", async () => {
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Pausar Claude" }));
    await userEvent.click(dialog().getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.pauseClaudeAction).not.toHaveBeenCalled();
  });
});

describe("BotSettings · tope mensual de tokens", () => {
  const monthlyRow = () => section().getAllByRole("listitem")[2];

  it("sin tope: lo dice y cuánto va del mes", () => {
    render(<BotSettings {...props()} />);
    expect(monthlyRow()).toHaveTextContent("Tope mensual de tokensSin tope. Este mes van 37.579 tokens.");
  });

  it("con tope: cuánto va y qué parte; casi nada es <1 %", () => {
    const { rerender } = render(<BotSettings {...props({ monthlyTokenLimit: 2_000_000 })} />);
    expect(monthlyRow()).toHaveTextContent("2.000.000 al mes, de todas las cuentas. Este mes van 37.579 (1 %).");
    rerender(<BotSettings {...props({ monthlyTokenLimit: 100_000_000 })} />);
    expect(monthlyRow()).toHaveTextContent("Este mes van 37.579 (<1 %).");
  });

  it("alcanzado: en rojo, y Claude en pausa hasta el mes siguiente", () => {
    render(<BotSettings {...props({ monthlyTokenLimit: 30_000, month: { used: 37_579, reached: true, resetsOn: "1 de noviembre" } })} />);
    expect(section().getByText("Alcanzado: 37.579 de 30.000. Claude vuelve el 1 de noviembre.")).toHaveClass("text-danger");
    expect(
      section().getByText("En pausa por el tope mensual hasta el 1 de noviembre: el bot solo responde balance, deshacer y ayuda."),
    ).toHaveClass("text-danger");
  });

  it("la pausa a mano se muestra aunque también se haya alcanzado el tope", () => {
    render(<BotSettings {...props({ claudePaused: true, monthlyTokenLimit: 30_000, month: { used: 40_000, reached: true, resetsOn: "1 de noviembre" } })} />);
    expect(section().getByText("En pausa: el bot solo responde balance, deshacer y ayuda.")).toBeInTheDocument();
  });

  it("la ventana estima para cuántos mensajes alcanza lo que se escribe, y lo envía con el código", async () => {
    actions.changeMonthlyLimitAction.mockResolvedValue({ message: "El tope mensual quedó en 2.000.000 tokens." });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el tope mensual de tokens" }));
    const field = dialog().getByLabelText("Tokens al mes");
    expect(field).toHaveValue("");
    expect(field).toHaveAccessibleDescription("Entre 10.000 y 100.000.000. En promedio, cada mensaje usa 1.708 tokens.");

    await userEvent.type(field, "2.000.000");
    expect(field).toHaveAccessibleDescription(/: alcanza para unos 1\.170 mensajes\.$/);
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar tope" }));

    const sent = actions.changeMonthlyLimitAction.mock.calls[0][1] as FormData;
    expect([sent.get("monthlyLimit"), sent.get("code")]).toEqual(["2.000.000", "123456"]);
    expect(await findToast()).toHaveTextContent("El tope mensual quedó en 2.000.000 tokens.");
  });

  it("vacío se puede enviar (quita el tope); un error del servidor va debajo del campo y lo escrito sigue", async () => {
    actions.changeMonthlyLimitAction.mockResolvedValue({ error: "El tope mensual va de 10.000 a 100.000.000 tokens.", field: "monthlyLimit" });
    render(<BotSettings {...props({ monthlyTokenLimit: 500_000, averageTokensPerCall: null })} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el tope mensual de tokens" }));
    const field = dialog().getByLabelText("Tokens al mes");
    expect(field).toHaveValue("500000");
    expect(field).toHaveAccessibleDescription("Entre 10.000 y 100.000.000.");
    await userEvent.clear(field);
    await userEvent.type(field, "500");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar tope" }));
    expect(field).toHaveAccessibleDescription("Entre 10.000 y 100.000.000. El tope mensual va de 10.000 a 100.000.000 tokens.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveValue("500");
  });

  it("con decimales, el error sale en español antes de enviar", async () => {
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el tope mensual de tokens" }));
    await userEvent.type(dialog().getByLabelText("Tokens al mes"), "2,5");
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Guardar tope" }));
    expect(dialog().getByLabelText("Tokens al mes")).toHaveAccessibleDescription(
      /Escribe un número entero de tokens, sin decimales \(o déjalo vacío\)\.$/,
    );
    expect(actions.changeMonthlyLimitAction).not.toHaveBeenCalled();
  });
});
