import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../../test/locale";

// La acción se simula: aquí, qué se muestra y qué se envía. Guardarla de verdad, la cookie y la vuelta a
// Mi cuenta se prueban en integración (src/modules/account/language.int.test.ts) y en las E2E.
const actions = vi.hoisted(() => ({ saveLanguageAction: vi.fn<(data: FormData) => Promise<void>>() }));
vi.mock("@/modules/account/actions", () => actions);

const { LanguagePicker } = await import("./language-picker");

beforeEach(() => {
  actions.saveLanguageAction.mockReset().mockResolvedValue();
});

describe("LanguagePicker", () => {
  it("cada idioma con su nombre en ese idioma (y su lang); marcado, el de la página", () => {
    render(<LanguagePicker />);
    expect(screen.getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Español" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
    expect(screen.getByText("English").closest("label")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Español").closest("label")).toHaveAttribute("lang", "es");
  });

  it("al elegir otro, lo envía sin otro botón", async () => {
    render(<LanguagePicker />);
    await userEvent.click(screen.getByText("English"));
    await waitFor(() => expect(actions.saveLanguageAction).toHaveBeenCalledOnce());
    expect(actions.saveLanguageAction.mock.calls[0][0].get("locale")).toBe("en");
  });

  it("en inglés, marcado English", async () => {
    render(<LanguagePicker />, { wrapper: InEnglish });
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    await userEvent.click(screen.getByText("Español"));
    await waitFor(() => expect(actions.saveLanguageAction).toHaveBeenCalledOnce());
    expect(actions.saveLanguageAction.mock.calls[0][0].get("locale")).toBe("es");
  });

  it("mientras guarda, no deja elegir otro y lo anuncia", async () => {
    let finish: () => void = () => {};
    actions.saveLanguageAction.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<LanguagePicker />);
    await userEvent.click(screen.getByText("English"));
    await waitFor(() => expect(screen.getByRole("group", { name: "Idioma" })).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("Guardando…");
    finish();
    await waitFor(() => expect(screen.getByRole("group", { name: "Idioma" })).toBeEnabled());
  });
});
