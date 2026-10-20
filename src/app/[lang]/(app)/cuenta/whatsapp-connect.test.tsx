import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../../test/locale";

// La Server Action y el router se simulan; el reloj también, para probar la cuenta regresiva.
const mocks = vi.hoisted(() => ({ generate: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/whatsapp/actions", () => ({ generateLinkCodeAction: mocks.generate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const { WhatsAppConnect } = await import("./whatsapp-connect");

const NOW = new Date("2026-10-14T15:00:00Z").getTime();
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

async function generateCode(props: { botNumber: string | null; showSimulator?: boolean }) {
  render(<WhatsAppConnect botNumber={props.botNumber} showSimulator={props.showSimulator ?? false} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
  mocks.generate.mockResolvedValue({ ok: true, code: "482913", expiresAt: inMinutes(10) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WhatsAppConnect", () => {
  it("antes de generar el código explica para qué sirve", () => {
    render(<WhatsAppConnect botNumber="573001112233" showSimulator={false} />);
    expect(screen.getByText(/me compré unos zapatos de \$500\.000/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
  });

  it("muestra el mensaje que hay que enviar, el número del bot y un enlace que lo abre en WhatsApp", async () => {
    await generateCode({ botNumber: "573001112233" });

    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(screen.getByText("VINCULAR 482913")).toBeVisible();
    expect(screen.getByText("+57 300 111 2233")).toBeVisible();
    const link = screen.getByRole("link", { name: "Abrir WhatsApp" });
    expect(link).toHaveAttribute("href", "https://wa.me/573001112233?text=VINCULAR%20482913");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/Vence en 10 minutos/)).toBeVisible();
  });

  it("sin número del bot configurado no muestra el enlace", async () => {
    await generateCode({ botNumber: null });
    expect(screen.getByText(/al número del bot/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Abrir WhatsApp" })).not.toBeInTheDocument();
  });

  it("solo ofrece el simulador cuando se pide", async () => {
    await generateCode({ botNumber: null, showSimulator: true });
    expect(screen.getByRole("link", { name: "Pruébalo en el simulador" })).toHaveAttribute("href", "/simulador");
  });

  it("cada 4 segundos revisa si ya se vinculó y actualiza los minutos que faltan", async () => {
    mocks.generate.mockResolvedValue({ ok: true, code: "482913", expiresAt: inMinutes(1.5) });
    await generateCode({ botNumber: null });
    expect(screen.getByText(/Vence en 2 minutos/)).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(4_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(40_000));
    expect(screen.getByText(/Vence en 1 minuto\./)).toBeVisible();
  });

  it("cuando el código vence, lo dice, deja generar otro y deja de revisar", async () => {
    mocks.generate.mockResolvedValue({ ok: true, code: "482913", expiresAt: inMinutes(0.1) });
    await generateCode({ botNumber: null });

    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByText("El código venció. Genera uno nuevo.")).toBeVisible();
    expect(screen.queryByText(/VINCULAR/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();

    const refreshes = mocks.refresh.mock.calls.length;
    act(() => vi.advanceTimersByTime(60_000));
    expect(mocks.refresh).toHaveBeenCalledTimes(refreshes);
  });

  it("si ya pidió muchos códigos, muestra el aviso y deja el botón para intentar más tarde", async () => {
    const error = "Ya generaste varios códigos en la última hora. Usa el último que generaste o espera un rato para pedir otro.";
    mocks.generate.mockResolvedValue({ ok: false, error });
    await generateCode({ botNumber: null });

    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(screen.queryByText(/^VINCULAR/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();

    // Si después sí se puede, el aviso desaparece.
    mocks.generate.mockResolvedValue({ ok: true, code: "333444", expiresAt: inMinutes(10) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("VINCULAR 333444")).toBeVisible();
  });

  it("mientras genera el código, desactiva el botón", async () => {
    let finish!: (value: { ok: true; code: string; expiresAt: string }) => void;
    mocks.generate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<WhatsAppConnect botNumber={null} showSimulator={false} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
    });
    expect(screen.getByRole("button", { name: "Generando…" })).toBeDisabled();

    await act(async () => finish({ ok: true, code: "111222", expiresAt: inMinutes(10) }));
    expect(screen.getByText("VINCULAR 111222")).toBeVisible();
  });
});

describe("WhatsAppConnect · en inglés", () => {
  it("los textos en inglés; el mensaje para el bot sigue en español (VINCULAR)", async () => {
    render(<WhatsAppConnect botNumber="573001112233" showSimulator />, { wrapper: InEnglish });
    expect(screen.getByText(/Connect your number and add expenses by writing/)).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect WhatsApp" }));
    });
    expect(screen.getByText("VINCULAR 482913")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute("href", "https://wa.me/573001112233?text=VINCULAR%20482913");
    expect(screen.getByText(/It expires in 10 minutes/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Try it in the simulator" })).toHaveAttribute("href", "/simulador");
  });
});
