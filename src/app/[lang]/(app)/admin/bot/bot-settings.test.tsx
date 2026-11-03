import { screen, within } from "@testing-library/react";
import { findToast, renderWithToaster as render, toasts } from "../../../../../../test/toaster";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotSettingsProps } from "./bot-settings";

// Las Server Actions se simulan: aquí se prueba la interfaz (qué se muestra, qué se envía y cómo
// responde a cada resultado). Lo que hacen de verdad se prueba en integración y en las E2E.
const actions = vi.hoisted(() => ({
  pauseClaudeAction: vi.fn(),
  resumeClaudeAction: vi.fn(),
  changeAiLimitsAction: vi.fn(),
  changeMonthlyLimitAction: vi.fn(),
  changeBotModelAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { BotSettings } = await import("./bot-settings");

// jsdom no tiene showModal ni close: lo mínimo para abrir y cerrar la ventana.
beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const props = (overrides: Partial<BotSettingsProps> = {}): BotSettingsProps => ({
  claudePaused: false,
  limits: { perHour: 20, perDay: 100 },
  monthlyTokenLimit: null,
  month: { used: 37579, reached: false, resetsOn: "1 de noviembre" },
  averageTokensPerCall: 1708,
  averageUsage: { input: 1500, output: 208 },
  model: "claude-haiku-5-5",
  modelsEvaluatedOn: "21 de oct. de 2026",
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
    expect(section().getByText("En pausa: el bot solo responde balance, reporte, deshacer y ayuda.")).toHaveClass("text-danger");
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
    // Pausar es apagar algo: en rojo. La ventana se cerró: el foco va al aviso.
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(toast).toHaveFocus();
  });

  it("reanudar usa su propia acción", async () => {
    actions.resumeClaudeAction.mockResolvedValue({ message: "Claude volvió a funcionar." });
    render(<BotSettings {...props({ claudePaused: true })} />);
    await userEvent.click(section().getByRole("button", { name: "Reanudar Claude" }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Reanudar" }));
    expect(actions.resumeClaudeAction).toHaveBeenCalledTimes(1);
    expect((actions.resumeClaudeAction.mock.calls[0][1] as FormData).get("code")).toBe("123456");
    expect(actions.pauseClaudeAction).not.toHaveBeenCalled();
    const toast = await findToast();
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveFocus();
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
    const toast = await findToast();
    expect(toast).toHaveTextContent("Los topes quedaron en 30 por hora y 150 por día");
    expect(toast).toHaveFocus();
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
      section().getByText("En pausa por el tope mensual hasta el 1 de noviembre: el bot solo responde balance, reporte, deshacer y ayuda."),
    ).toHaveClass("text-danger");
  });

  it("la pausa a mano se muestra aunque también se haya alcanzado el tope", () => {
    render(<BotSettings {...props({ claudePaused: true, monthlyTokenLimit: 30_000, month: { used: 40_000, reached: true, resetsOn: "1 de noviembre" } })} />);
    expect(section().getByText("En pausa: el bot solo responde balance, reporte, deshacer y ayuda.")).toBeInTheDocument();
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
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    // Vacío se envía (quita el tope): el campo no es obligatorio.
    await userEvent.click(dialog().getByRole("button", { name: "Guardar tope" }));
    expect((actions.changeMonthlyLimitAction.mock.calls[0][1] as FormData).get("monthlyLimit")).toBe("");
    await userEvent.type(field, "500");
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

describe("BotSettings · modelo de Claude", () => {
  it("el de ahora, cuánto acertó en bot:eval y cuánto cuestan 1.000 mensajes con el promedio de tokens", () => {
    render(<BotSettings {...props()} />);
    const row = section().getAllByRole("listitem")[3];
    expect(row).toHaveTextContent("Modelo de ClaudeClaude Haiku 5.5: acertó 58 de 58 frases de prueba · unos US$0,25 cada 1.000 mensajes");
    // Sin mensajes todavía, sin costo; uno de BOT_MODEL que no está en la lista, sin evaluación.
    render(<BotSettings {...props({ averageUsage: null, model: "claude-modelo-x" })} />);
    expect(screen.getAllByRole("region", { name: "Configuración" })[1]).toHaveTextContent("claude-modelo-x: —");
  });

  it("la ventana: cada modelo con lo suyo, el de ahora marcado; se envía el elegido con el código", async () => {
    actions.changeBotModelAction.mockResolvedValue({ message: "El bot ahora usa Claude Sonnet 5.5, desde el siguiente mensaje." });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el modelo de Claude" }));
    expect(screen.getByRole("dialog", { name: "Cambiar el modelo de Claude" })).toHaveAccessibleDescription(/pnpm bot:eval, el 21 de oct\. de 2026/);
    const options = dialog().getAllByRole("radio");
    expect(options.map((option) => option.getAttribute("value"))).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(dialog().getByRole("radio", { name: /Claude Haiku 5\.5 \(el de ahora\)/ })).toBeChecked();
    expect(dialog().getByRole("radio", { name: /Claude Sonnet 5\.5/ }).closest("label")).toHaveTextContent(
      "Acertó 57 de 58 frases de prueba · unos US$5,08 cada 1.000 mensajes",
    );

    await userEvent.click(dialog().getByRole("radio", { name: /Claude Sonnet 5\.5/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar modelo" }));
    const sent = actions.changeBotModelAction.mock.calls[0][1] as FormData;
    expect([sent.get("model"), sent.get("code")]).toEqual(["claude-sonnet-5-5", "123456"]);
    expect(await findToast()).toHaveTextContent("El bot ahora usa Claude Sonnet 5.5, desde el siguiente mensaje.");
  });

  it("si el servidor rechaza el modelo, el error va debajo de la lista y la elección sigue", async () => {
    actions.changeBotModelAction.mockResolvedValue({ error: "El bot ya usa ese modelo: elige otro.", field: "model" });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el modelo de Claude" }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar modelo" }));
    expect(await dialog().findByText("El bot ya usa ese modelo: elige otro.")).toBeInTheDocument();
    expect(dialog().getByRole("group", { name: "Modelo" })).toHaveAccessibleDescription("El bot ya usa ese modelo: elige otro.");
    expect(dialog().getByRole("radio", { name: /Claude Haiku 5\.5/ })).toBeChecked();
  });

  // React vacía el formulario al terminar la acción: con radios controlados volvía a quedar marcado el de
  // ahora y, al volver a enviar, se mandaba ese y no el elegido.
  it("la elección del modelo sigue tras un código equivocado y se vuelve a enviar", async () => {
    actions.changeBotModelAction.mockResolvedValue({ error: "El código no es correcto.", field: "code" });
    render(<BotSettings {...props()} />);
    await userEvent.click(section().getByRole("button", { name: "Cambiar el modelo de Claude" }));
    await userEvent.click(dialog().getByRole("radio", { name: /Claude Sonnet 5\.5/ }));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "111111");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar modelo" }));
    expect(await dialog().findByText("El código no es correcto.")).toBeInTheDocument();
    expect(dialog().getByRole("radio", { name: /Claude Sonnet 5\.5/ })).toBeChecked();
    expect(dialog().getByRole("radio", { name: /Claude Haiku 5\.5/ })).not.toBeChecked();
    expect(dialog().getByLabelText("Código de Google Authenticator")).toHaveValue("");

    actions.changeBotModelAction.mockResolvedValue({ message: "El bot ahora usa Claude Sonnet 5.5, desde el siguiente mensaje." });
    // userEvent recuerda el valor de antes de que React limpiara el campo: se borra primero.
    await userEvent.clear(dialog().getByLabelText("Código de Google Authenticator"));
    await userEvent.type(dialog().getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(dialog().getByRole("button", { name: "Cambiar modelo" }));
    expect(await findToast()).toHaveTextContent("El bot ahora usa Claude Sonnet 5.5, desde el siguiente mensaje.");
    const sent = actions.changeBotModelAction.mock.calls[1][1] as FormData;
    expect([sent.get("model"), sent.get("code")]).toEqual(["claude-sonnet-5-5", "123456"]);
  });
});

describe("BotSettings en inglés", () => {
  const en = (overrides: Partial<BotSettingsProps> = {}) => props({ month: { used: 37579, reached: false, resetsOn: "November 1" }, ...overrides });
  const settings = () => within(screen.getByRole("region", { name: "Settings" }));

  it("el estado, los topes y el tope mensual, con los números como en Estados Unidos", () => {
    render(<BotSettings {...en({ monthlyTokenLimit: 2_000_000 })} />, { english: true });
    const rows = settings().getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ClaudeOn: it understands freely written messages.");
    expect(rows[1]).toHaveTextContent("Limits per account20 per hour and 100 per day of messages with Claude.");
    expect(rows[2]).toHaveTextContent("2,000,000 a month, across all accounts. 37,579 so far this month (1%).");
    expect(settings().getByText("No changes: the defaults apply.")).toBeInTheDocument();
    expect(settings().getByRole("button", { name: "Pause Claude" })).toBeInTheDocument();
    expect(settings().getByRole("button", { name: "Change the limits per account" })).toHaveTextContent("Change");
    expect(rows[3]).toHaveTextContent("Claude modelClaude Haiku 5.5: got 58 of 58 test phrases right · about $0.25 per 1,000 messages");
  });

  it("en pausa, y alcanzado el tope mensual", () => {
    render(<BotSettings {...en({ monthlyTokenLimit: 30_000, month: { used: 31_000, reached: true, resetsOn: "November 1" }, lastChange: "Ana Admin · Oct 16" })} />, {
      english: true,
    });
    const rows = settings().getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Paused by the monthly limit until November 1: the bot only answers balance, report, undo and help.");
    expect(rows[2]).toHaveTextContent("Reached: 31,000 of 30,000. Claude comes back on November 1.");
    expect(settings().getByText("Last change: Ana Admin · Oct 16")).toBeInTheDocument();
  });

  it("pausar: la ventana y los errores del código", async () => {
    render(<BotSettings {...en()} />, { english: true });
    await userEvent.click(settings().getByRole("button", { name: "Pause Claude" }));
    const box = screen.getByRole("dialog", { name: "Pause Claude?" });
    expect(box).toHaveAccessibleDescription(expect.stringContaining("While paused, it doesn't spend Anthropic credits."));
    await userEvent.click(within(box).getByRole("button", { name: "Pause" }));
    expect(within(box).getByLabelText("Google Authenticator code")).toHaveAccessibleDescription("Enter the 6-digit code from Google Authenticator.");
    expect(actions.pauseClaudeAction).not.toHaveBeenCalled();
  });

  it("los topes: con la coma de los miles y sus errores en inglés", async () => {
    render(<BotSettings {...en()} />, { english: true });
    await userEvent.click(settings().getByRole("button", { name: "Change the limits per account" }));
    const box = within(screen.getByRole("dialog", { name: "Change the limits per account" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(/Up to 200 per hour and 2,000 per day\./);
    const perDay = box.getByLabelText("Per day");
    expect(perDay).toHaveAttribute("pattern", "\\s*\\d[\\d,]*\\s*");
    await userEvent.clear(perDay);
    await userEvent.clear(box.getByLabelText("Per hour"));
    await userEvent.click(box.getByRole("button", { name: "Save limits" }));
    expect(box.getByLabelText("Per hour")).toHaveAccessibleDescription("Enter how many messages per hour.");
    expect(perDay).toHaveAccessibleDescription("Enter how many messages per day.");
    // El punto no es un separador en inglés: "1.5" no pasa; "1,500" sí.
    await userEvent.type(perDay, "1.5");
    await userEvent.click(box.getByRole("button", { name: "Save limits" }));
    expect(perDay).toHaveAccessibleDescription("Enter a whole number, without decimals.");
    await userEvent.clear(perDay);
    await userEvent.type(perDay, "1,500");
    expect(perDay).toBeValid();
  });

  it("el tope mensual: el rango y cuánto alcanza, con comas", async () => {
    render(<BotSettings {...en()} />, { english: true });
    await userEvent.click(settings().getByRole("button", { name: "Change the monthly token limit" }));
    const box = within(screen.getByRole("dialog", { name: "Change the monthly token limit" }));
    const input = box.getByLabelText("Tokens a month");
    expect(input).toHaveAttribute("placeholder", "No limit");
    await userEvent.type(input, "1,708,000");
    expect(input).toHaveAccessibleDescription(
      "Between 10,000 and 100,000,000. On average, each message uses 1,708 tokens: enough for about 1,000 messages.",
    );
    expect(box.getByRole("button", { name: "Save limit" })).toBeInTheDocument();
  });
});
