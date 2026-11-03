import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GmfSettingState } from "@/modules/transactions/actions";
import { findToast, renderWithToaster as render } from "../../../../../test/toaster";

const action = vi.hoisted(() => vi.fn<(prev: GmfSettingState, data: FormData) => Promise<GmfSettingState>>());
vi.mock("@/modules/transactions/actions", () => ({ saveGmfSettingAction: action }));

const { GmfSettings } = await import("./gmf-settings");

const section = () => within(screen.getByRole("region", { name: "4x1000" }));
const toggle = () => section().getByRole("switch", { name: /Cobro del 4x1000/ });
const save = () => section().getByRole("button", { name: "Guardar" });

beforeEach(() => {
  action.mockReset();
});

describe("GmfSettings (Configuración → 4x1000)", () => {
  it("muestra lo guardado, con la explicación de qué cambia", () => {
    render(<GmfSettings enabled />);
    expect(section().getByText(/al registrar un egreso puedes aplicarlo y el bot te pregunta/)).toBeVisible();
    expect(toggle()).toBeChecked();
    expect(section().getByText("Prendido")).toBeVisible();
  });

  it("apagarlo lo guarda y lo avisa en rojo; el interruptor dice Apagado", async () => {
    action.mockResolvedValue({ message: "Apagaste el 4x1000: ya no te lo ofrecemos ni te lo preguntamos.", tone: "removal" });
    render(<GmfSettings enabled />);
    await userEvent.click(toggle());
    expect(section().getByText("Apagado")).toBeVisible();
    await userEvent.click(save());
    expect(action.mock.calls[0][1].get("enabled")).toBeNull();
    expect(await findToast()).toHaveTextContent("Apagaste el 4x1000: ya no te lo ofrecemos ni te lo preguntamos.");
    expect(toggle()).not.toBeChecked();
  });

  it("prenderlo manda la casilla marcada", async () => {
    action.mockResolvedValue({ message: "Listo", tone: "success" });
    render(<GmfSettings enabled={false} />);
    expect(section().getByText("Apagado")).toBeVisible();
    await userEvent.click(toggle());
    await userEvent.click(save());
    expect(action.mock.calls[0][1].get("enabled")).toBe("on");
    expect(toggle()).toBeChecked();
  });

  it("en inglés", () => {
    render(<GmfSettings enabled />, { english: true });
    expect(screen.getByRole("switch", { name: /4x1000 charge/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
  });
});
