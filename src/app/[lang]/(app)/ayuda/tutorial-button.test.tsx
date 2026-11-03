import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../../test/locale";
import { TutorialButton } from "./tutorial-button";

const finish = vi.hoisted(() => vi.fn());
vi.mock("@/modules/tutorial/actions", () => ({ finishTutorialAction: finish }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const values = { upcomingEnabled: true, budgetNearShare: 80 };

describe("TutorialButton (Ayuda)", () => {
  it("abre el tutorial desde el primer paso cada vez, sin cambiar nada de la cuenta", async () => {
    const user = userEvent.setup();
    render(<TutorialButton values={values} />);
    const open = screen.getByRole("button", { name: "Ver el tutorial de bienvenida" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(open);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tu mes de un vistazo");
    await user.click(screen.getByRole("button", { name: "Omitir" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();

    await user.click(open);
    expect(screen.getByRole("dialog", { name: "Te damos la bienvenida a Anotado" })).toBeVisible();
    expect(finish).not.toHaveBeenCalled();
  });

  it("en inglés", () => {
    render(<TutorialButton values={values} />, { wrapper: InEnglish });
    expect(screen.getByRole("button", { name: "See the welcome tutorial" })).toBeVisible();
  });
});
