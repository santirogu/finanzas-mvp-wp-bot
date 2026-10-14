import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth-errors";

// Better Auth y el router se simulan: se prueba qué envía el formulario y qué muestra.
type Result = { error: { code?: string; status?: number; message?: string } | null };
const mocks = vi.hoisted(() => ({
  signIn: vi.fn<(body: unknown) => Promise<Result>>(),
  signUp: vi.fn<(body: unknown) => Promise<Result>>(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: mocks.signIn }, signUp: { email: mocks.signUp } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

const { AuthForm } = await import("./auth-form");

const email = () => screen.getByLabelText("Correo");
const password = () => screen.getByLabelText("Contraseña");

async function fillLogin(mail = "ana@gmail.com", pass = "clave-segura-123") {
  await userEvent.type(email(), mail);
  await userEvent.type(password(), pass);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
});

describe("AuthForm · login", () => {
  it("pide correo y contraseña, y enlaza al registro", () => {
    render(<AuthForm mode="login" />);
    expect(screen.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
    expect(email()).toHaveAttribute("type", "email");
    expect(password()).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("link", { name: "Regístrate" })).toHaveAttribute("href", "/registro");
  });

  it("se envía por POST si el JavaScript aún no cargó (la contraseña nunca va en la URL)", () => {
    render(<AuthForm mode="login" />);
    expect(screen.getByRole("button", { name: "Entrar" }).closest("form")).toHaveAttribute("method", "post");
  });

  it("con datos correctos entra y va al dashboard", async () => {
    render(<AuthForm mode="login" />);
    await fillLogin();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(mocks.signIn).toHaveBeenCalledWith({ email: "ana@gmail.com", password: "clave-segura-123" });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each([
    [{ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, "Correo o contraseña incorrectos."],
    [{ status: 429, message: "Too many requests. Please try again later." }, TOO_MANY_ATTEMPTS],
  ])("si falla (%o) avisa en español y no navega", async (error, message) => {
    mocks.signIn.mockResolvedValue({ error });
    render(<AuthForm mode="login" />);
    await fillLogin();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mocks.replace).not.toHaveBeenCalled();
    // Lo escrito se conserva para reintentar.
    expect(email()).toHaveValue("ana@gmail.com");
  });

  it("al reintentar, borra el error anterior", async () => {
    mocks.signIn.mockResolvedValueOnce({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    render(<AuthForm mode="login" />);
    await fillLogin();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras espera la respuesta, desactiva el botón", async () => {
    let finish!: (result: Result) => void;
    mocks.signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<AuthForm mode="login" />);
    await fillLogin();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("button", { name: "Un momento…" })).toBeDisabled();
    finish({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("no sugiere correcciones de correo al iniciar sesión", async () => {
    render(<AuthForm mode="login" />);
    await userEvent.type(email(), "ana@gmal.com");
    await userEvent.tab();
    expect(screen.queryByText(/Quisiste decir/)).not.toBeInTheDocument();
  });
});

describe("AuthForm · registro", () => {
  async function fillRegister(mail: string) {
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana Pérez");
    await userEvent.type(email(), mail);
    await userEvent.type(password(), "clave-segura-123");
  }

  it("pide nombre y una contraseña nueva de al menos 8 caracteres, y enlaza al login", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeVisible();
    expect(screen.getByLabelText("Nombre")).toBeRequired();
    expect(password()).toHaveAttribute("autocomplete", "new-password");
    expect(password()).toHaveAttribute("minlength", "8");
    expect(screen.getByRole("link", { name: "Inicia sesión" })).toHaveAttribute("href", "/login");
  });

  it("crea la cuenta con nombre, correo y contraseña", async () => {
    render(<AuthForm mode="register" />);
    await fillRegister("ana@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      name: "Ana Pérez",
      email: "ana@gmail.com",
      password: "clave-segura-123",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("al salir del campo sugiere corregir un dominio mal escrito, y lo corrige con un clic", async () => {
    render(<AuthForm mode="register" />);
    await userEvent.type(email(), "ana@gmal.com");
    await userEvent.tab();

    expect(screen.getByText(/Quisiste decir/)).toHaveTextContent("¿Quisiste decir ana@gmail.com?");
    await userEvent.click(screen.getByRole("button", { name: "Sí, corregir" }));
    expect(email()).toHaveValue("ana@gmail.com");
    expect(screen.queryByText(/Quisiste decir/)).not.toBeInTheDocument();
  });

  it("con un dominio sospechoso, el primer envío solo avisa; si insiste con el mismo correo, lo crea", async () => {
    render(<AuthForm mode="register" />);
    await fillRegister("ana@gmal.com");

    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(screen.getByText(/presiona “Crear cuenta” de nuevo/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@gmal.com" }));
  });

  it("si cambia el correo, la sugerencia desaparece", async () => {
    render(<AuthForm mode="register" />);
    const input = email();
    await userEvent.type(input, "ana@gmal.com");
    await userEvent.tab();
    expect(screen.getByText(/Quisiste decir/)).toBeVisible();

    await userEvent.type(input, "x");
    expect(screen.queryByText(/Quisiste decir/)).not.toBeInTheDocument();
  });

  // Falla conocida: la sugerencia (con su botón) está dentro del <label> del correo, así que el
  // nombre accesible del campo pasa a ser "Correo ¿Quisiste decir …? Sí, corregir" y queda un
  // botón dentro de una etiqueta. Se corrige en una rama fix/ (sugerencia fuera del label, unida
  // con aria-describedby); luego quitar `.fails`.
  it.fails("con la sugerencia visible, el campo se sigue llamando 'Correo' y la sugerencia lo describe", async () => {
    render(<AuthForm mode="register" />);
    await userEvent.type(email(), "ana@gmal.com");
    await userEvent.tab();

    const input = screen.getByRole("textbox", { name: "Correo" });
    expect(input).toHaveAccessibleDescription(/Quisiste decir ana@gmail.com/);
  });

  it("avisa si ya existe una cuenta con ese correo", async () => {
    mocks.signUp.mockResolvedValue({ error: { code: "USER_ALREADY_EXISTS" } });
    render(<AuthForm mode="register" />);
    await fillRegister("ana@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una cuenta con ese correo.");
  });
});
