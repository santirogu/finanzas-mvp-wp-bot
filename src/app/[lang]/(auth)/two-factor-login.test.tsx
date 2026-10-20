import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InEnglish } from "../../../../test/locale";

type Result = { data?: unknown; error: { code?: string; status?: number; message?: string } | null };
const mocks = vi.hoisted(() => ({
  verifyTotp: vi.fn<(body: unknown) => Promise<Result>>(),
  verifyBackupCode: vi.fn<(body: unknown) => Promise<Result>>(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { twoFactor: { verifyTotp: mocks.verifyTotp, verifyBackupCode: mocks.verifyBackupCode } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));

const { TwoFactorLogin } = await import("./two-factor-login");

const submit = () => userEvent.click(screen.getByRole("button", { name: "Verificar" }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyTotp.mockResolvedValue({ data: {}, error: null });
  mocks.verifyBackupCode.mockResolvedValue({ data: {}, error: null });
});

describe("TwoFactorLogin", () => {
  it("no se envía un código que no tenga 6 dígitos", async () => {
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "12345");
    await submit();
    expect(mocks.verifyTotp).not.toHaveBeenCalled();
  });

  it("pide el código de 6 dígitos con el teclado numérico y autocompletado de códigos", () => {
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Código de 6 dígitos");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toBeRequired();
    expect(input).toHaveFocus();
    expect(screen.getByText(/Abre Google Authenticator/)).toBeVisible();
  });

  it("verifica el código sin espacios y entra al dashboard", async () => {
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "123 456");
    await submit();
    expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    expect(mocks.verifyBackupCode).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("con un código incorrecto muestra el error en español y no entra", async () => {
    mocks.verifyTotp.mockResolvedValue({ error: { status: 401, code: "INVALID_CODE", message: "Invalid code" } });
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "000000");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("con la verificación bloqueada lo explica", async () => {
    mocks.verifyTotp.mockResolvedValue({ error: { status: 429, code: "ACCOUNT_TEMPORARILY_LOCKED" } });
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "000000");
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("bloqueada 15 minutos");
  });

  it("sin el celular, se puede usar un código de respaldo (y volver)", async () => {
    mocks.verifyTotp.mockResolvedValue({ error: { status: 401, code: "INVALID_CODE" } });
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "000000");
    await submit();
    expect(await screen.findByRole("alert")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /usar un código de respaldo/ }));
    // Al cambiar de modo se borra el error y el campo cambia.
    expect(screen.queryByRole("alert")).toBeNull();
    const input = screen.getByLabelText("Código de respaldo");
    expect(input).toHaveAttribute("inputmode", "text");
    expect(input).toHaveValue("");
    await userEvent.type(input, "AbCdE-12345");
    await submit();
    expect(mocks.verifyBackupCode).toHaveBeenCalledWith({ code: "AbCdE-12345" });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");

    await userEvent.click(screen.getByRole("button", { name: "Usar Google Authenticator" }));
    expect(screen.getByLabelText("Código de 6 dígitos")).toBeVisible();
  });

  it("mientras verifica, el botón queda desactivado", async () => {
    let finish!: (r: Result) => void;
    mocks.verifyTotp.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), "123456");
    await submit();
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    finish({ error: { code: "INVALID_CODE" } });
    expect(await screen.findByRole("alert")).toBeVisible();
  });

  it("'Volver a iniciar sesión' avisa al formulario", async () => {
    const onCancel = vi.fn();
    render(<TwoFactorLogin onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Volver a iniciar sesión" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("TwoFactorLogin · errores del código en español", () => {
  it("vacío, o sin 6 dígitos, lo dice debajo del campo", async () => {
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Código de 6 dígitos");
    await submit();
    expect(input).toHaveAccessibleDescription("Escribe el código de 6 dígitos de Google Authenticator.");
    await userEvent.type(input, "12a");
    expect(input).toHaveAccessibleDescription("El código tiene 6 dígitos, solo números.");
    expect(mocks.verifyTotp).not.toHaveBeenCalled();
  });

  it("con un código de respaldo pide ese, y no quedan mensajes del modo anterior", async () => {
    render(<TwoFactorLogin onCancel={vi.fn()} />);
    await submit();
    await userEvent.click(screen.getByRole("button", { name: /usar un código de respaldo/ }));
    const input = screen.getByLabelText("Código de respaldo");
    expect(input).not.toHaveAttribute("aria-invalid");
    await submit();
    expect(input).toHaveAccessibleDescription("Escribe uno de tus códigos de respaldo.");
    expect(mocks.verifyBackupCode).not.toHaveBeenCalled();
  });
});


describe("TwoFactorLogin · en inglés", () => {
  it("los textos y los errores en inglés, también con un código de respaldo", async () => {
    mocks.verifyTotp.mockResolvedValue({ error: { status: 401, code: "INVALID_CODE", message: "Invalid code" } });
    render(<TwoFactorLogin onCancel={() => {}} />, { wrapper: InEnglish });
    expect(screen.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Enter the 6-digit code from Google Authenticator.")).toBeVisible();
    await userEvent.type(screen.getByLabelText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong code. Enter the code Google Authenticator shows right now.");
    await userEvent.click(screen.getByRole("button", { name: "I don't have my phone: use a backup code" }));
    expect(screen.getByLabelText("Backup code")).toBeVisible();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeVisible();
  });
});
