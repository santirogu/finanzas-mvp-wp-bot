import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error: { code?: string; status?: number; message?: string } | null };
const mocks = vi.hoisted(() => ({
  enable: vi.fn<(body: unknown) => Promise<Result>>(),
  verifyTotp: vi.fn<(body: unknown) => Promise<Result>>(),
  finish: vi.fn<() => Promise<void>>(),
  done: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { twoFactor: { enable: mocks.enable, verifyTotp: mocks.verifyTotp } },
}));
vi.mock("./actions", () => ({ finishTwoFactorSetupAction: mocks.finish }));

const { TwoFactorSetup } = await import("./two-factor-setup");

const TOTP_URI = "otpauth://totp/Finanzas%20MVP:ana%40test.local?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Finanzas+MVP";
const BACKUP_CODES = Array.from({ length: 10 }, (_, i) => `codig-${String(i).padStart(5, "0")}`);

async function passStep1() {
  await userEvent.type(screen.getByLabelText("Tu contraseña"), "clave-segura-123");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("heading", { name: /Paso 2 de 3/ });
}

async function passStep2(code = "123456") {
  await userEvent.type(screen.getByLabelText("Código de 6 dígitos"), code);
  await userEvent.click(screen.getByRole("button", { name: "Activar la verificación" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enable.mockResolvedValue({ data: { method: "totp", totpURI: TOTP_URI, backupCodes: BACKUP_CODES }, error: null });
  mocks.verifyTotp.mockResolvedValue({ data: {}, error: null });
  mocks.finish.mockResolvedValue();
});

describe("TwoFactorSetup · paso 1 (contraseña)", () => {
  it("pide la contraseña actual", () => {
    render(<TwoFactorSetup onDone={mocks.done} />);
    expect(screen.getByRole("heading", { name: /Paso 1 de 3/ })).toBeVisible();
    const input = screen.getByLabelText("Tu contraseña");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });

  it("envía la contraseña y pasa a escanear", async () => {
    render(<TwoFactorSetup onDone={mocks.done} />);
    await passStep1();
    expect(mocks.enable).toHaveBeenCalledWith({ password: "clave-segura-123" });
  });

  it.each([
    [{ status: 400, code: "INVALID_PASSWORD" }, "Contraseña incorrecta."],
    [{ status: 429, code: "ACCOUNT_LOCKED", message: "Por seguridad, la cuenta quedó bloqueada… 9 minutos." }, "9 minutos"],
    [{ status: 403, code: "ADMIN_ONLY" }, "solo para administradores"],
  ])("si falla (%j) lo explica y se queda en el paso 1", async (error, text) => {
    mocks.enable.mockResolvedValue({ error });
    render(<TwoFactorSetup onDone={mocks.done} />);
    await userEvent.type(screen.getByLabelText("Tu contraseña"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("heading", { name: /Paso 1 de 3/ })).toBeVisible();
  });

  it("si la respuesta no trae el código QR, no avanza", async () => {
    mocks.enable.mockResolvedValue({ data: { method: "totp" }, error: null });
    render(<TwoFactorSetup onDone={mocks.done} />);
    await userEvent.type(screen.getByLabelText("Tu contraseña"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos empezar la configuración");
  });
});

describe("TwoFactorSetup · paso 2 (escanear)", () => {
  it("muestra el QR y la clave para escribir a mano, en grupos de 4", async () => {
    render(<TwoFactorSetup onDone={mocks.done} />);
    await passStep1();
    expect(screen.getByRole("img", { name: /Código QR para agregar Finanzas MVP/ })).toBeVisible();
    expect(screen.getByLabelText("Clave de configuración")).toHaveTextContent(
      "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP",
    );
    // Los códigos de respaldo todavía no se muestran.
    expect(screen.queryByText(BACKUP_CODES[0])).toBeNull();
  });

  it("con el código correcto la activa, cierra las otras sesiones y muestra los códigos de respaldo", async () => {
    render(<TwoFactorSetup onDone={mocks.done} />);
    await passStep1();
    await passStep2("123 456");

    expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    expect(mocks.finish).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: /Paso 3 de 3/ })).toBeVisible();
    const list = screen.getByRole("list", { name: "Códigos de respaldo" });
    for (const code of BACKUP_CODES) expect(list).toHaveTextContent(code);
  });

  it("con un código incorrecto lo dice y no la activa", async () => {
    mocks.verifyTotp.mockResolvedValue({ error: { status: 401, code: "INVALID_CODE" } });
    render(<TwoFactorSetup onDone={mocks.done} />);
    await passStep1();
    await passStep2("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Código incorrecto");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Paso 2 de 3/ })).toBeVisible();
  });
});

describe("TwoFactorSetup · paso 3 (códigos de respaldo)", () => {
  it("copia los códigos y solo deja seguir tras confirmar que se guardaron", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<TwoFactorSetup onDone={mocks.done} />);
    await passStep1();
    await passStep2();
    await screen.findByRole("heading", { name: /Paso 3 de 3/ });

    await userEvent.click(screen.getByRole("button", { name: "Copiar los códigos" }));
    expect(writeText).toHaveBeenCalledWith(BACKUP_CODES.join("\n"));
    expect(screen.getByRole("button", { name: "Copiados ✓" })).toBeVisible();

    const go = screen.getByRole("button", { name: "Ir a Administración" });
    expect(go).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Ya guardé mis códigos de respaldo"));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(mocks.done).toHaveBeenCalledOnce();
  });
});

describe("TwoFactorSetup · errores de los campos en español", () => {
  it("sin la contraseña, y después sin el código, lo dice debajo de cada campo", async () => {
    render(<TwoFactorSetup onDone={mocks.done} />);
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tu contraseña")).toHaveAccessibleDescription("Escribe tu contraseña.");

    await userEvent.type(screen.getByLabelText("Tu contraseña"), "clave-segura-123");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    const code = await screen.findByLabelText("Código de 6 dígitos");
    // El paso nuevo empieza sin mensajes.
    expect(code).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Activar la verificación" }));
    expect(code).toHaveAccessibleDescription("Escribe el código de 6 dígitos de Google Authenticator.");
    await userEvent.type(code, "123");
    expect(code).toHaveAccessibleDescription("El código tiene 6 dígitos, solo números.");
    expect(mocks.verifyTotp).not.toHaveBeenCalled();
  });
});

