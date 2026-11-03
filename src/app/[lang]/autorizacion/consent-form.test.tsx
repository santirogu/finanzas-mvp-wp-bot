import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivacyConsentState } from "@/modules/account/actions";
import { InEnglish } from "../../../../test/locale";

const action = vi.hoisted(() => vi.fn<(prev: PrivacyConsentState, data: FormData) => Promise<PrivacyConsentState>>());
vi.mock("@/modules/account/actions", () => ({ acceptPrivacyAction: action }));

const { ConsentForm } = await import("./consent-form");

const box = () => screen.getByRole("checkbox", { name: /^Soy mayor de 18 años y autorizo el tratamiento de mis datos personales/ });
const button = () => screen.getByRole("button", { name: /Aceptar y continuar|Un momento/ });

beforeEach(() => {
  action.mockReset().mockResolvedValue({});
});

describe("ConsentForm (la autorización de los datos, en /autorizacion)", () => {
  it("la casilla empieza sin marcar y es obligatoria", () => {
    render(<ConsentForm />);
    expect(box()).not.toBeChecked();
    expect(box()).toBeRequired();
  });

  it("sin marcarla no envía: lo dice debajo de la casilla y le pone el cursor", async () => {
    render(<ConsentForm />);
    await userEvent.click(button());
    expect(action).not.toHaveBeenCalled();
    expect(box()).toHaveAccessibleDescription("Para seguir, marca la casilla de la autorización.");
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(box()).toHaveFocus();

    await userEvent.click(box());
    expect(box()).not.toHaveAttribute("aria-invalid");
  });

  it("marcada, la envía", async () => {
    render(<ConsentForm />);
    await userEvent.click(box());
    await userEvent.click(button());
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][1].get("privacy")).toBe("on");
  });

  it("muestra el error que devuelve el servidor", async () => {
    action.mockResolvedValue({ error: "Para seguir, marca la casilla de la autorización." });
    render(<ConsentForm />);
    await userEvent.click(box());
    await userEvent.click(button());
    expect(await screen.findByText("Para seguir, marca la casilla de la autorización.")).toBeVisible();
  });

  it("en inglés", async () => {
    render(<ConsentForm />, { wrapper: InEnglish });
    expect(screen.getByRole("checkbox", { name: "I'm 18 or older and I authorize the processing of my personal data under the privacy policy." })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription("To continue, check the authorization box.");
  });
});
