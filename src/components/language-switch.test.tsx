import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../test/locale";

// El selector de idioma sin sesión: las dos opciones con su nombre en su idioma, cuál está elegida y la página a la
// que vuelve. La acción se simula (su prueba está en src/i18n/actions.test.ts).
const navigation = vi.hoisted(() => ({ pathname: "/es/login" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
const choose = vi.hoisted(() => vi.fn<(data: FormData) => Promise<void>>(async () => {}));
vi.mock("@/i18n/actions", () => ({ chooseLanguageAction: choose }));

const { LanguageSwitch } = await import("./language-switch");

beforeEach(() => {
  choose.mockClear();
  navigation.pathname = "/es/login";
});

const group = (name = "Idioma") => within(screen.getByRole("group", { name }));

describe("LanguageSwitch", () => {
  it("ES y EN, cada uno con su nombre en su idioma; el de la página, marcado", () => {
    render(<LanguageSwitch />);
    const spanish = group().getByRole("button", { name: "ES Español" });
    const english = group().getByRole("button", { name: "EN English" });
    expect(spanish).toHaveTextContent("ES");
    expect(spanish).toHaveAttribute("lang", "es");
    expect(spanish).toHaveAttribute("aria-pressed", "true");
    expect(english).toHaveTextContent("EN");
    expect(english).toHaveAttribute("lang", "en");
    expect(english).toHaveAttribute("aria-pressed", "false");
  });

  it("manda el idioma tocado y la página donde está (sin el idioma de adelante)", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitch />);
    await user.click(group().getByRole("button", { name: "EN English" }));
    expect(choose).toHaveBeenCalledOnce();
    expect(Object.fromEntries(choose.mock.calls[0][0])).toEqual({ to: "/login", locale: "en" });
  });

  it("con `to`, vuelve ahí en vez de a la ruta de la página (la Ayuda pública se arma por dentro en otra)", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/es/ayuda-publica";
    render(<LanguageSwitch to="/ayuda" />);
    await user.click(group().getByRole("button", { name: "EN English" }));
    expect(Object.fromEntries(choose.mock.calls[0][0])).toEqual({ to: "/ayuda", locale: "en" });
  });

  it("en inglés, el grupo se llama Language y EN está marcado", () => {
    navigation.pathname = "/en";
    render(<LanguageSwitch />, { wrapper: InEnglish });
    expect(group("Language").getByRole("button", { name: "EN English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("/")).toHaveAttribute("name", "to");
  });
});
