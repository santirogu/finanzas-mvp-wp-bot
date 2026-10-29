import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../test/locale";
import { WelcomeTutorial } from "./welcome-tutorial";

const finish = vi.hoisted(() => vi.fn<() => Promise<void>>());
const push = vi.hoisted(() => vi.fn());
vi.mock("@/modules/tutorial/actions", () => ({ finishTutorialAction: finish }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const values = { upcomingEnabled: true, budgetNearShare: 80 };
const dialog = () => screen.getByRole("dialog");
const button = (name: string) => within(dialog()).getByRole("button", { name });
const queryButton = (name: string) => within(dialog()).queryByRole("button", { name });

/** Avanza `steps` pasos con Siguiente (Next, en inglés). */
async function next(user: ReturnType<typeof userEvent.setup>, steps: number, label = "Siguiente") {
  for (let i = 0; i < steps; i++) await user.click(button(label));
}

beforeEach(() => {
  finish.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

describe("WelcomeTutorial", () => {
  it("se abre como modal en el primer paso, con el foco en Siguiente y sin Atrás", () => {
    render(<WelcomeTutorial values={values} />);
    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "Te damos la bienvenida a Anotado" })).toHaveAccessibleDescription(
      "Aquí llevas tus ingresos y egresos y ves cómo te va cada mes. Te mostramos lo principal en cinco pasos cortos.",
    );
    expect(screen.getByText("Paso 1 de 5")).toHaveClass("sr-only");
    expect(button("Siguiente")).toHaveFocus();
    expect(queryButton("Atrás")).toBeNull();
    expect(button("Omitir")).toBeVisible();
  });

  it("recorre los cinco pasos: el Resumen, WhatsApp, los fijos y los reportes, con el foco siempre en Siguiente", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} />);
    const titles = ["Tu mes de un vistazo", "Anota por WhatsApp", "Tus gastos fijos", "Cómo te va"];
    for (const [i, title] of titles.entries()) {
      await next(user, 1);
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(title);
      expect(screen.getByText(`Paso ${i + 2} de 5`)).toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: i === 3 ? "Empezar" : "Siguiente" })).toHaveFocus();
    }
    // Las pestañas y secciones que nombra, en negrita.
    expect(within(dialog()).getByText("Reportes", { selector: "strong" })).toBeInTheDocument();
    expect(dialog()).toHaveTextContent("te avisamos al llegar al 80 %.");
  });

  it("el paso se lee desde una región que avisa los cambios (el foco no se mueve)", () => {
    render(<WelcomeTutorial values={values} />);
    expect(screen.getByRole("heading", { level: 2 }).parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("Atrás vuelve un paso; en el primero no hay Atrás y el foco pasa a Siguiente", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} />);
    await next(user, 2);
    await user.click(button("Atrás"));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tu mes de un vistazo");
    await user.click(button("Atrás"));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Te damos la bienvenida a Anotado");
    expect(queryButton("Atrás")).toBeNull();
    expect(button("Siguiente")).toHaveFocus();
  });

  it("en el último paso, Empezar cierra y ya no hay Omitir", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WelcomeTutorial values={values} remember onClose={onClose} />);
    await next(user, 4);
    expect(queryButton("Omitir")).toBeNull();
    await user.click(button("Empezar"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledOnce();
  });

  it("Omitir cierra desde cualquier paso y, la primera vez (remember), no vuelve a salir", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} remember />);
    await next(user, 1);
    await user.click(button("Omitir"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(finish).toHaveBeenCalledOnce();
  });

  it("desde Ayuda (sin remember) no cambia nada de la cuenta", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WelcomeTutorial values={values} onClose={onClose} />);
    await user.click(button("Omitir"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
  });

  it("en el paso de WhatsApp lleva a Mi cuenta: cierra la ventana y va cuando quedó guardado (una sola vez)", async () => {
    const user = userEvent.setup();
    let saved!: () => void;
    finish.mockReturnValue(new Promise((resolve) => (saved = resolve)));
    render(<WelcomeTutorial values={values} remember />);
    await next(user, 2);
    const link = within(dialog()).getByRole("link", { name: "Conectar WhatsApp" });
    expect(link).toHaveAttribute("href", "/cuenta#whatsapp");
    expect(dialog()).toHaveTextContent("(“almuerzo 25 mil”) o envíale la foto de una factura");
    await user.click(link);
    expect(screen.queryByRole("dialog")).toBeNull();
    // La otra página no conoce la Server Action: hasta que responda, no se va.
    expect(push).not.toHaveBeenCalled();
    saved();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/cuenta#whatsapp"));
    expect(finish).toHaveBeenCalledOnce();
  });

  it("si no se pudo guardar, igual va a Mi cuenta", async () => {
    const user = userEvent.setup();
    finish.mockRejectedValue(new Error("sin red"));
    render(<WelcomeTutorial values={values} remember />);
    await next(user, 2);
    await user.click(within(dialog()).getByRole("link", { name: "Conectar WhatsApp" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/cuenta#whatsapp"));
  });

  it("desde Ayuda, el enlace va a Mi cuenta sin guardar nada", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} />);
    await next(user, 2);
    await user.click(within(dialog()).getByRole("link", { name: "Conectar WhatsApp" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/cuenta#whatsapp"));
    expect(finish).not.toHaveBeenCalled();
  });

  it("solo el paso de WhatsApp trae el enlace", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} />);
    const withLink: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      withLink.push(within(dialog()).queryByRole("link") !== null);
      if (i < 4) await next(user, 1);
    }
    expect(withLink).toEqual([false, false, true, false, false]);
  });

  it("con los avisos de pagos apagados por defecto, dice que se prenden en Configuración; el porcentaje es el de la app", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={{ upcomingEnabled: false, budgetNearShare: 75 }} />);
    await next(user, 3);
    expect(dialog()).toHaveTextContent("Si prendes los avisos en Configuración, te avisamos de los que tocan pronto.");
    await next(user, 1);
    expect(dialog()).toHaveTextContent("te avisamos al llegar al 75 %.");
  });

  it("en inglés", async () => {
    const user = userEvent.setup();
    render(<WelcomeTutorial values={values} />, { wrapper: InEnglish });
    expect(screen.getByRole("dialog", { name: "Welcome to Anotado" })).toBeVisible();
    expect(button("Skip")).toBeVisible();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    await next(user, 2, "Next");
    expect(within(dialog()).getByRole("link", { name: "Connect WhatsApp" })).toBeVisible();
    // El ejemplo va en español, como se le escribe al bot.
    expect(within(dialog()).getByText("“almuerzo 25 mil”")).toHaveAttribute("lang", "es");
    await next(user, 2, "Next");
    expect(dialog()).toHaveTextContent("we let you know when you reach 80%.");
    expect(button("Get started")).toHaveFocus();
    expect(button("Back")).toBeVisible();
  });
});
