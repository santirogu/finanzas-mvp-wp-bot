import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionsState } from "./actions";
import { InEnglish } from "../../../../../../test/locale";

// La Server Action se simula: aquí se prueba qué se muestra. Lo que hace de verdad se prueba en
// integración y en la E2E.
const actions = vi.hoisted(() => ({ testConnectionsAction: vi.fn() }));
vi.mock("./actions", () => actions);

const { Connections } = await import("./connections");

beforeEach(() => {
  actions.testConnectionsAction.mockReset();
});

const ok: ConnectionsState = {
  whatsapp: { ok: true, title: "Conectado", detail: "Finanzas MVP · +1 555-662-5913", warning: null },
  claude: { ok: true, title: "Conectado", detail: "Claude Haiku 5.5 (claude-haiku-5-5)", warning: null },
  lastMessage: "16 de oct de 2026, 6:00 p. m.",
  checkedAt: "6:05 p. m.",
};
const section = () => within(screen.getByRole("region", { name: "Conexiones" }));

describe("Connections", () => {
  it("antes de probar, explica qué hace y no muestra resultados", () => {
    render(<Connections />);
    expect(section().getByText(/sin enviar mensajes ni gastar créditos/)).toBeInTheDocument();
    expect(section().getByRole("status")).toBeEmptyDOMElement();
    expect(section().getByRole("button", { name: "Probar conexiones" })).toBeEnabled();
  });

  it("al probar, muestra cada servicio, el último mensaje y la hora, y anuncia el resultado", async () => {
    actions.testConnectionsAction.mockResolvedValue(ok);
    render(<Connections />);
    await userEvent.click(section().getByRole("button", { name: "Probar conexiones" }));

    const status = section().getByRole("status");
    // La acción es asíncrona: hay que esperar sus resultados (sin esperar, fallaba a veces en el CI).
    const rows = await within(status).findAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("WhatsApp: ConectadoFinanzas MVP · +1 555-662-5913");
    expect(rows[1]).toHaveTextContent("Claude: ConectadoClaude Haiku 5.5 (claude-haiku-5-5)");
    expect(status).toHaveTextContent("Último mensaje que llegó al webhook: 16 de oct de 2026, 6:00 p. m. Probado a las 6:05 p. m.");
    expect(section().getByRole("button", { name: "Probar otra vez" })).toBeInTheDocument();
    expect(actions.testConnectionsAction).toHaveBeenCalledTimes(1);
  });

  it("un servicio que falla va en rojo, con su detalle; los avisos también", async () => {
    actions.testConnectionsAction.mockResolvedValue({
      ...ok,
      whatsapp: { ok: false, title: "El token de WhatsApp no sirve", detail: "HTTP 401 · (#190) Session has expired.", warning: null },
      claude: { ok: true, title: "Conectado", detail: "Claude Haiku 5.5", warning: "Anthropic marcó el modelo como obsoleto." },
      lastMessage: null,
    });
    render(<Connections />);
    await userEvent.click(section().getByRole("button", { name: "Probar conexiones" }));

    // Con find: la respuesta de la acción puede llegar después del clic (con la máquina cargada, fallaba a veces).
    expect(await section().findByText("El token de WhatsApp no sirve")).toHaveClass("text-danger");
    expect(section().getByText("HTTP 401 · (#190) Session has expired.")).toBeInTheDocument();
    expect(section().getByText("Anthropic marcó el modelo como obsoleto.")).toHaveClass("text-danger");
    expect(section().getByRole("status")).toHaveTextContent("Todavía no ha llegado ningún mensaje al webhook.");
  });

  it("mientras prueba, el botón dice que está probando y no se puede volver a tocar", async () => {
    let finish: (state: ConnectionsState) => void = () => {};
    actions.testConnectionsAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<Connections />);
    await userEvent.click(section().getByRole("button", { name: "Probar conexiones" }));
    expect(section().getByRole("button", { name: "Probando…" })).toBeDisabled();
    finish(ok);
    expect(await section().findByRole("button", { name: "Probar otra vez" })).toBeEnabled();
  });
});

describe("Connections en inglés", () => {
  it("antes y después de probar", async () => {
    actions.testConnectionsAction.mockResolvedValue({
      whatsapp: { ok: true, title: "Connected", detail: "Finanzas MVP", warning: null },
      claude: { ok: false, title: "Couldn't connect to the service", detail: null, warning: null },
      lastMessage: null,
      checkedAt: "6:05 PM",
    });
    render(<Connections />, { wrapper: InEnglish });
    const region = within(screen.getByRole("region", { name: "Connections" }));
    expect(region.getByText(/without sending messages or spending credits/)).toBeInTheDocument();
    await userEvent.click(region.getByRole("button", { name: "Test connections" }));
    const status = region.getByRole("status");
    await within(status).findAllByRole("listitem");
    expect(status).toHaveTextContent("No message has reached the webhook yet. Tested at 6:05 PM.");
    expect(region.getByRole("button", { name: "Test again" })).toBeInTheDocument();
  });

  it("con el último mensaje", async () => {
    actions.testConnectionsAction.mockResolvedValue({ ...ok, lastMessage: "Oct 16, 2026, 6:00 PM", checkedAt: "6:05 PM" });
    render(<Connections />, { wrapper: InEnglish });
    const region = within(screen.getByRole("region", { name: "Connections" }));
    await userEvent.click(region.getByRole("button", { name: "Test connections" }));
    await within(region.getByRole("status")).findAllByRole("listitem");
    expect(region.getByRole("status")).toHaveTextContent("Last message that reached the webhook: Oct 16, 2026, 6:00 PM. Tested at 6:05 PM.");
  });
});
